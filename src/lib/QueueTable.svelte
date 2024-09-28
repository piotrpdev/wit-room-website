<script lang="ts">
import { fade } from "svelte/transition";
import Spinner from "./Spinner.svelte";
import type { RoomQueue } from "./fetchers";

export let roomQueue: RoomQueue;
</script>

<div class="queue" out:fade|global={{ duration: 300 }} in:fade|global={{ delay: 300, duration: 300 }}>
    <p class="small-text muted-text">Finding free rooms... (this might take a while)</p>
            {#if Object.keys(roomQueue).length > 0}
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <!-- <th>Room</th>
                                <th>Status</th> -->
                                {#each Object.keys(roomQueue) as room}
                                    <th>{room}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                {#each Object.keys(roomQueue) as room}
                                    <td class="queue-result">
                                        {#if roomQueue[room] === null}
                                            In Queue
                                        {:else}
                                            {#await roomQueue[room]}
                                                <Spinner />
                                            {:then roomPromise}
                                                {#if roomPromise.error}
                                                    <p class="error">Error</p>
                                                {:else}
                                                    <div in:fade|global={{ duration: 300 }} class="queue-item-success">
                                                        <p>Success</p>
                                                        <p class="small-text">({roomPromise.fetchTime}ms)</p>
                                                    </div>
                                                {/if}
                                            {:catch}
                                                <p class="error">Error</p>
                                            {/await}
                                        {/if}
                                    </td>
                                {/each}
                            </tr>
                        </tbody>
                    </table>
                </div>
            {/if}
</div>

<style>
  .queue {
	display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .queue-result {
	height: 60px;
	/* width: 70px; */
    min-width: 70px;
  }
  .queue-item-success {
	display: flex;
	flex-direction: column;
	align-items: center;
  }
  .queue-item-success p {
	margin: 0;
  }
  .queue-item-success p.small-text {
	color: var(--more-more-muted-primary);
  }
</style>
