import "./app.css";
import App from "./App.svelte";

const app = new App({
	// biome-ignore lint/style/noNonNullAssertion: Valid use case
	target: document.getElementById("app")!,
});

export default app;
