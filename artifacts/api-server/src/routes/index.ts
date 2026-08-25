import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blockchainRouter from "./blockchain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blockchainRouter);

export default router;
