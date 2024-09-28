<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fade } from "svelte/transition";
import {
	type ProcessedRoomData,
	type TimetableState,
	days,
	isCloseTime,
	times,
} from "./processors";

export let processedRoomData: ProcessedRoomData;
export let formPromiseData: TimetableState[];
export let roomsToCheck: string[];

let currentDate = new Date();

// For testing
// let currentDate = new Date("2024-09-26T11:20:00");

function updateDate() {
	const newDate = new Date();
	if (newDate.getMinutes() - currentDate.getMinutes() >= 10) {
		currentDate = newDate;
	}
}

const timeCheckInterval = 1000 * 5;
let timeCheckIntervalHandle: number | undefined;
function resetTimeCheckInterval() {
	clearInterval(timeCheckIntervalHandle);
	timeCheckIntervalHandle = setInterval(updateDate, timeCheckInterval);
}

onMount(() => {
	resetTimeCheckInterval();
});

onDestroy(() => {
	clearInterval(timeCheckIntervalHandle);
});
</script>

<div id="result" out:fade|global={{ duration: 300 }} in:fade|global={{ delay: 300, duration: 300 }}>
    <p id="rotation-message" class="small-text muted-text">(You might want to rotate your phone)</p>
    <div class="table-wrapper">
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>Error(s)</th>
                    <th>Timeout(s)</th>
                    <th>Empty Timetable(s)</th>
                    <th>Timetable(s)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th></th>
                    <td>{processedRoomData.errorCount}</td>
                    <td>{formPromiseData.filter(roomPromise => roomPromise.fetchError).length}</td>
                    <td>{processedRoomData.emptyTimetableCount}</td>
                    <td>{processedRoomData.timetableCount}</td>
                </tr>
                <tr>
                    <th>Rooms Checked</th>
                    <td colSpan="5">{roomsToCheck.join(", ")}</td>
                </tr>
                <tr>
                    <th>Rooms with Error(s)</th>
                    <td colSpan="5">{processedRoomData.roomsWithErrors.join(", ")}</td>
                </tr>
            </tbody>
        </table>
    </div>
    {#if processedRoomData.freeRoomTable}
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th></th>
                        {#each days as day}
                            <th>{day}</th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each times as time}
                        <tr>
                            <th>{time}</th>
                            {#each days as day}
                                {#if processedRoomData.freeRoomTable?.[day]?.[time] !== undefined}
                                    <td class:closestTime={isCloseTime(currentDate, day, time)}>
                                        {processedRoomData.freeRoomTable[day][time].join(", ")}
                                    </td>
                                {:else}
                                    <td></td>
                                {/if}
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<style>
  #result {
	max-width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
  }
  #rotation-message {
	display: none;
	margin-bottom: 6px;
  }
  td.closestTime {
	border: var(--table-border-highlight) solid 2px;
  }
  @media screen and (orientation: portrait) {
	#rotation-message {
		display: block;
	}
  }
</style>
