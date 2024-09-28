<script>
import { fade } from "svelte/transition";

// Taken from https://cssloaders.github.io/
</script>

<span class="loader" in:fade={{ duration: 300 }}></span>

<style>
.loader {
  width: 32px;
  height: 32px;
  border: 4px solid var(--spinner-background);
  border-bottom-color: var(--spinner-color);
  border-radius: 50%;
  display: inline-block;
  box-sizing: border-box;
  animation: rotation 1s linear infinite;
  }

  @keyframes rotation {
  0% {
      transform: rotate(0deg);
  }
  100% {
      transform: rotate(360deg);
  }
}
</style>
