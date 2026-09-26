import Page from "./page";
import { qsr } from "../utils/dom";

export const page = new Page({
  id: "documents",
  element: qsr(".page.pageDocuments"),
  path: "/documents",
});
