import {asyncHandler} from "../util/asyncHandler.js"
import { ApiError } from "../util/ApiError.js"
import { User } from "../models/user.model.js"
import {uploadOnCloudinary} from "../util/cloudinary.js"
import { ApiResponse } from "../util/ApiResponse.js"
import jwt from "jsonwebtoken"


const generateRefreshAndAccessToken = async(userId) => {
    try {
       const user = await User.findById(userId)
       const accessToken = user.generateAccessToken()
       const refreshToken = user.generateRefreshToken()

       user.refreshToken = refreshToken
       await user.save({validateBeforeSave: false})

       return {accessToken, refreshToken}
       
    } catch (error) {
        throw new ApiError(500, "Error generating tokens")
    }
}

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
    // console.log(req.body)

    if([fullName, email, username, password].some((field)=>
        field?.trim() === "")
    ){
     throw new ApiError(400, "All fields are required!")   
    }
    
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with username or email already exists!")
    }
    // console.log("req.files: ", req.files)

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path; 
    // (IMP NOTE: Commented this out because in Postman it was throwing an undefined error — we were only checking avatar for existence,
    //  but not checking coverImage before accessing [0]. So if coverImage was not provided in the request, it caused a TypeError due to 
    // trying to read property [0] of undefined.)

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
       coverImageLocalPath =  req.files.coverImage[0].path
    } 

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }
    // this is why we put async in the beginning of this code coz uploading will take time
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    // console.log("avatar: ", avatar.url)
    // console.log("coverImage: ", coverImage.url)

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
    new ApiResponse(200, createdUser, "User registered  sucessfully!")
   )
} )

const loginUser = asyncHandler(async (req,res) => {
    //req.body -> data
    //username or email
    //find the user
    //check if password is correct
    //access and refresh token generation
    //send cookie
    const {username, password, email} = req.body

    if(!email && !username){
    throw new ApiError(400, "Username or email is required!")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User not found!")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid credentials!")
    }

    const { accessToken, refreshToken } = await generateRefreshAndAccessToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("refreshToken",refreshToken,options)
    .cookie("accessToken",accessToken,options)
    .json(
        new ApiResponse(
        200,
        {
            user: loggedInUser, refreshToken, accessToken
        },
        "User logged in successfully!"
        )
    )
 } )

 const logOutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true,  
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(
            200,
           {},
            "User logged out successfully!"
        )
    )
})

const refreshAccessToken = asyncHandler(async(req,res) =>{

    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized Access!")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
         if(!user){
            throw new ApiError(401,"Invalid Refresh Token!")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired or used!")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const  {newRefreshToken, accessToken} = await generateRefreshAndAccessToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken",accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken,
                    refreshToken : newRefreshToken
                },
                "Access Token refreshed successfully!"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token!!")
    }


})

const changeCurrentPassword = asyncHandler(async(req,res) =>{
    
    const {oldPassword, newPassword} = req.body

    if(!oldPassword || !newPassword){
        throw new ApiError(400, "Old and new passwords are required!")
    }

    const user = await User.findById(req.user?._id)

    if(!user){
        throw new ApiError(404, "User not found!")
    }

    const isPasswordValid = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordValid){
        throw new ApiError(401, "Old password is incorrect!")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {},
            "Password changed successfully!"
        )
    )

})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {
                user: req.user
            },
            "Current user fetched successfully!"
        )
    )
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, username} = req.body

    if(!fullName || !username){
        throw new ApiError(400, "Full name and username are required!")
    }

    user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                fullName,username
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Account details updated successfully!"
        )
    )
    
})
// Note:ve used req.file.?path , chatGpt said to use req.file?.avatar[0]?.path
const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
       throw new ApiError(400,"Avatar is missing!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
       throw new ApiError(400,"Error while uploading on Cloudinary!")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {
            new:true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Avatar uploaded successfully"
        )
    )
})
// Note: have used req.file.?path , chatGpt said to use req.file?.coverImage[0]?.path 
const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image path missing!")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
       throw new ApiError(400,"Error while uploading on Cloudinary!")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage : coverImage?.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Cover Image uploaded successfully"
        )
    )
})

const getUserChannelProfile = asyncHandler(async ( req, res) => {
    const {username} = req.params

    if(!username){
        throw new ApiError(400, "Username is required!")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username : username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount: {
                    $size : "$subscribers"
                },
                channelsSubscribedTo: {
                    $size: "$subscribedTo"
                },
                $cond : {
                    if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                    then: true,
                    else: false
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channelsSubscribedTo: 1,
                isSubscribed: 1,
                email: 1,

            }
        }
    ])
    if(!channel || channel.length === 0){
        throw new ApiError(404, "Channel not found!")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            channel[0],
            "Channel profile fetched successfully!"
        )
    )
}) 


export {
    registerUser,
    loginUser,
    logOutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile
}