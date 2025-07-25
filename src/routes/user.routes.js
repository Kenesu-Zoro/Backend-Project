import { Router } from "express"
import { loginUser, logOutUser, registerUser, refreshAccessToken } from "../controllers/user.controller.js"
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"


const router = Router()

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route("/login").post(loginUser)

//secured routes( after verification using our JWT middleware)
router.route("/logout").post(verifyJWT, logOutUser)
//(In the above line of code we are suing logout route after verification from our auth.middleware and the in the post 
//mehod we are calling the logoutUser function and injecting verifyJWT middleware to check if the user is authenticated before logging out.)

router.route("/refresh-token").post(refreshAccessToken)
export default router