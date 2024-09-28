<script lang="ts">
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import appLogo from "/favicon.svg";
import PWABadge from "./lib/PWABadge.svelte";
import QueueTable from "./lib/QueueTable.svelte";
import ResultsTable from "./lib/ResultsTable.svelte";
import RoomFieldset from "./lib/RoomFieldset.svelte";
import Spinner from "./lib/Spinner.svelte";
import {
	type InitData,
	type RoomQueue,
	type RoomQueueEntrySetter,
	emptyInitData,
	fetchInitData,
	fetchRoomsInSequence,
} from "./lib/fetchers";
import {
	type ProcessedRoomData,
	type TimetableState,
	processParsedRoomData,
} from "./lib/processors";

let roomsToCheck: string[] = [];
let formPromise: Promise<TimetableState[]>;
let processedRoomData: ProcessedRoomData;

let roomQueue: RoomQueue = {};

// biome-ignore lint/style/useConst: svelte modifies this
let userChoice = "it-rooms";
// biome-ignore lint/style/useConst: svelte modifies this
let userPattern = "IT10";
let userRoom: string;

// Should be replaced immediately anyway, just here to avoid unnecessary re-render
let initDataPromise: Promise<InitData> = new Promise((resolve) => {
	setTimeout(() => {
		resolve(emptyInitData);
	}, 1000 * 60);
});

onMount(() => {
	initDataPromise = fetchInitData();
});

const handleForm = async () => {
	console.log("Handling form submission");
	performance.mark("handleForm-start");

	const { pageState, allRooms } = await initDataPromise;

	switch (userChoice) {
		case "it-rooms": {
			console.log("Checking IT rooms");
			roomsToCheck = allRooms
				.filter((room) => room.value.startsWith("IT"))
				.map((room) => room.value);
			break;
		}
		case "use-pattern": {
			console.log("Checking rooms by pattern");
			const patternRegex = new RegExp(userPattern, "i");
			roomsToCheck = allRooms
				.filter((room) => patternRegex.test(room.value))
				.map((room) => room.value);
			break;
		}
		case "use-room": {
			console.log("Checking specific room");
			roomsToCheck = [userRoom];
			break;
		}
		default:
			console.error("Unknown room choice");
			return;
	}

	roomQueue = {};
	const setRoomQueueEntry: RoomQueueEntrySetter = (
		room: string,
		promise: Promise<TimetableState> | null,
	) => {
		roomQueue = {
			...roomQueue,
			[room]: promise,
		};
	};

	formPromise = fetchRoomsInSequence(
		pageState,
		roomsToCheck,
		setRoomQueueEntry,
	);
	const roomData = await formPromise;
	console.debug(roomData);
	processedRoomData = processParsedRoomData(
		roomData.filter((room) => !room.fetchError),
	);
	console.debug(processedRoomData);

	performance.mark("handleForm-end");
	const handleFormMeasure = performance.measure(
		"handleForm",
		"handleForm-start",
		"handleForm-end",
	);
	console.debug(
		`Handling form submission took ${Math.round(handleFormMeasure.duration)}ms`,
	);
};
</script>

<main>
  <img src={appLogo} class="logo" alt="Free WIT Rooms Logo" />
  <h1>Free WIT Rooms</h1>
  <p class="muted-text">
    Check which rooms are free during the week.
  </p>

  {#await initDataPromise}
    <p transition:fade={{ duration: 300 }} class="small-text muted-text">Fetching initial data... (this might take a while)</p>
    <Spinner />
  {:then initDataResult}
    <form in:fade={{ delay: 300, duration: 300 }} on:submit|preventDefault={handleForm}>
      <RoomFieldset allRooms={initDataResult.allRooms} bind:userChoice bind:userPattern bind:userRoom />
      <p class="small-text muted-text">(Fetching initial data took {initDataResult.fetchTime}ms)</p>
      {#await formPromise}
	  	<QueueTable {roomQueue} />
      {:then formPromiseData}
        <button out:fade={{ duration: 300 }} in:fade={{ delay: 300, duration: 300 }} type="submit">Find Free Rooms</button>
		{#if processedRoomData}
			<ResultsTable {processedRoomData} {formPromiseData} {roomsToCheck} />
		{/if}
      {:catch error}
        <p class="error">{error.message}</p>
      {/await}
    </form>
  {:catch error}
    <p class="error">{error.message}</p>
  {/await}
</main>

<PWABadge />

<style>
  .logo {
    height: 6em;
    padding: 1.5em;
    will-change: filter;
    transition: filter 300ms;
  }
  .logo:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }
  h1 {
    margin: 0;
  }
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  form {
    display: flex;
    flex-direction: column;
    align-items: center;
	width: 100%;
  }
  @media (width <= 768px) {
	h1 {
		font-size: 2.5em;
	}
  }
</style>
