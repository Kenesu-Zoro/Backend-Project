import {asyncHandler} from "../util/asyncHandler.js"
import { ApiError } from "../util/ApiError.js"
import { User } from "../models/user.model.js"
import {uploadOnCloudinary} from "../util/cloudinary.js"
import { ApiResponse } from "../util/ApiResponse.js"

const registerUser = asyncHandler( async (req,res) => {
    //get user details
    //validation
    //check if user exists ( from username & email)
    //check for images and avatar
    //upload them to cloudinary ( check avatar again )
    //create user object - db calls to create
    //remove password and refersh token field from response
    //check user creation
    //ret  urn response

    const {fullName, email, username, password} = req.body
    console.log("email: ", email)

    if([fullName, email, username, password].some((field)=>
        field?.trim() === "")
    ){
     throw new ApiError(400, "All fields are required!")   
    }
    
    const existedUser= User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with username or email already exists!")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }
    // this is why we put async in the beginning of this code coz uploading will take time
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
         throw new ApiError(400, "Avatar is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage : coverImage?.url || "",
        email, 
        password,
        username : username.toLowerCase()
    })

   const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
   )

   if(!createdUser){
    throw new ApiError(500, "Something went wrong when registering the user!")
   }

   return res.status(201).json(
    new ApiResponse(200, createdUser, "User registred successfully!")
   )
} )

export {registerUser}