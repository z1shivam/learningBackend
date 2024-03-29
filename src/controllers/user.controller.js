import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateRefreshToken();
    const refreshToken = user.generateAccessToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating refresh and access tokens."
    );
  }
};

// Steps to impliment register user
// 1. get data from frontend
// 2. check for required fields if they are empty or not.
// 3. check if username or email is unique || or user already exists
// 4. check if files are available or not. avatar and cover image
// 5. upload the image on cloudinary.
// 6. check if avatar is uploaded on cloudinary
// 7. Create user object - create entry on database
// 8. remove password and refresh token field from response
// 9. check if user creation is done successfully
// 10. return response.

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, fullName, password } = req.body;
  if (
    [username, email, fullName, password].some((field) =>
      [field?.trim() === ""].some(Boolean)
    )
  ) {
    throw new ApiError(404, "All fields are required");
  }

  // check for existing user
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) throw new ApiError(400, "User Already Exists.");

  const avatarLocalPath = req.files?.avatar[0]?.path;
  // why we want first property: becauae first property contains the object which contain path of the file on our server
  // const coverImageLocalPath = req.files?.coverImage[0]?.path || "";

  let coverImageLocalPath;
  if (
    req.files.coverImage &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) throw new ApiError(400, "Avatar File Required");

  // upload them to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!avatar) throw new ApiError(400, "Avatar not uploaded");

  const user = await User.create({
    username: username.toLowerCase(),
    fullName: fullName,
    avatar: avatar.url,
    email: email.toLowerCase(),
    coverImage: coverImage?.url || "",
    password: password,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) throw new ApiError(500, "Database Error");

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User created Successfully"));
});

/*
How to login user
1. get data from users
2. check if any empty string is there
3. search for username in database
4. if user found, compare the password using the bcrypt function specified in user.model.js
5. if function returns true, returns true and give the user, the access token. and refresh token
6. send cookie
*/

const loginUser = asyncHandler(async (req, res) => {
  // get data from user and check if email or username is there.
  const { username, email, password } = req.body;
  if (!username && !email) {
    throw new ApiError(400, "Email or Username Field is Required!");
  }

  // search for if username or email is there in db
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) throw new ApiError(404, "user does not exist.");

  // * At this point, we have found the user in the database, now we need to check if the password provided is true or false. for this we will use bcrypt password check(we defined in model file)
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(400, "Invalid Password");

  // now at this point, password is correct. now we will generate access and refresh token and send that to user.
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Now we have to send cookies.
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
        "User Logged In Successfully"
      )
    );
});
k
// stratedgy for logout.
const logoutUser = asyncHandler(async (req, res) => {
  const options = {
    httpOnly: true,
    secure: true,
  };

  User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    { new: true }
  );

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Logged Out SuccessFully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) throw new ApiError(401, "Unauthorized Request");
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const userId = decodedToken?._id;
    const user = await User.findById(userId);
    if (!user) throw new ApiError(401, "Invalid Token");

    if (user?.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, "Refresh Token is Expired or Used");
    }
    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, refreshToken } =
      await generateAccessAndRefreshTokens(userId);
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access Token Refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, "Refresh Token validation Failed");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword && !newPassword)
    throw new ApiError(400, "Both fields are required.");

  const user = await User.findById(req.user._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) throw new ApiError(401, "Unauthorized request");

  const newUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        password: newPassword,
      },
    },
    { new: true }
  );

  if (!newUser) throw new ApiError(401, "Problem with Updating Password");
  res
    .status(200)
    .json(new ApiResponse(201, {}, "Password Updated Successfully"));
});

const updateUserProfile = asyncHandler(async (req, res) => {
  const { fullName, email, username } = req.body;

  if (!fullName && !email && !username) {
    throw new ApiError(400, "All fields are required.");
  }

  try {
    const newUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          fullName,
          email,
          username,
        },
      },
      { new: true }
    ).select("-password");

    if (!newUser) {
      throw new ApiError(400, "There was an error updating the profile.");
    }

    res
      .status(200)
      .json(new ApiResponse(200, newUser, "User Profile Updated successfully"));
  } catch (error) {
    // Handle specific errors or log them for further investigation
    console.error(error);
    throw new ApiError(500, "Internal Server Error");
  }
});



export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updateUserProfile,
  changeCurrentPassword,
};
