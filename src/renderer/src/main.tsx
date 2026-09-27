import { render } from "solid-js/web";
import { App } from "./App";
import { initTheme } from "./core/theme";
import "./styles.css";

initTheme();
render(() => <App />, document.getElementById("app")!);
