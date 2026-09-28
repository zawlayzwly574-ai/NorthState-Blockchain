import { Router, type IRouter } from "express";
import blockchainRouter from "./blockchain";

const router: IRouter = Router();

router.use(blockchainRouter);

export default router;
