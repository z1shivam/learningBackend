import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

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

export { registerUser };
