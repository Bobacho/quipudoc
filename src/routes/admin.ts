import { Router, Request, Response } from "express"

import * as db from "../database"

const router = Router()


router.get("/admin/guide/insert", (req: Request, res: Response) => {

	return res.render("insert.ejs")
})
