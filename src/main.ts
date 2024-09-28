import "./app.css";
import App from "./App.svelte";

const app = new App({
	target:
		document.getElementById("app") ||
		(() => {
			throw new Error("No #app element found");
		})(),
});

export default app;
