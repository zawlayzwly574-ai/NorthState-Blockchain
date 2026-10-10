import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicSupportRouter from "./public-support";
import blockchainRouter from "./blockchain";

const router: IRouter = Router();

router.use(healthRouter);
// Public contact submissions must be handled before blockchainRouter applies
// requireMember to the signed-in member routes.
router.use(publicSupportRouter);
router.use(blockchainRouter);

export default router;
