<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fade } from "svelte/transition";
import appLogo from "/favicon.svg";
import PWABadge from "./lib/PWABadge.svelte";
import Spinner from "./lib/Spinner.svelte";

type ProcessedRoomData = {
	errorCount: number;
	roomsWithErrors: string[];
	emptyTimetableCount: number;
	freeTimesCount: number;
	timetableCount: number;
	freeRoomTable: Record<string, Record<string, string[]>>;
};

type TimetableState = {
	error: boolean;
	fetchError: boolean;
	fetchTime: number;
	empty: boolean;
	freeTimes: Record<string, string[]>;
	date: string;
	room: string;
	week: string;
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const times = [
	"09:15",
	"10:15",
	"11:15",
	"12:15",
	"13:15",
	"14:15",
	"15:15",
	"16:15",
	"17:15",
];

// https://github.com/Rob--W/cors-anywhere/issues/301#issuecomment-1470629190
const corsProxyUrl = "https://cors-proxy.fringe.zone/";
const roomUrl = "https://studentssp.wit.ie/Timetables/RoomTT.aspx";
const proxiedRoomUrl = new URL(corsProxyUrl + roomUrl);

const defaultRoomData = {
	// Causes issues with CORS proxy for some reason
	// __EVENTTARGET: "",
	__EVENTARGUMENT: "",
	__LASTFOCUS: "",
	hProgram: "",
	hStudentcount: "",
	cboSchool: "%",
	CboDept: "%",
	CboStartTime: "1",
	CboEndTime: "9",
	BtnRetrieve: "Generate Timetable",
};
Object.freeze(defaultRoomData);

let __VIEWSTATE = "";
let __VIEWSTATEGENERATOR = "";
let __EVENTVALIDATION = "";

let allRooms: HTMLOptionElement[] = [];

let roomsToCheck: string[] = [];
let formPromise: Promise<TimetableState[]>;
let processedRoomData: ProcessedRoomData;

let processQueue: Record<string, Promise<TimetableState> | null> = {};

let roundedFetchInitDataDuration = 0;
let initDataPromise: Promise<void> = new Promise((resolve) => {
	setTimeout(() => {
		resolve();
	}, 10000);
});

// let currentDate = new Date();
// TODO: Change this
let currentDate = new Date("2024-09-26T11:20:00");
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
	initDataPromise = fetchInitData();
});

onDestroy(() => {
	clearInterval(timeCheckIntervalHandle);
});

const dayFormatter = new Intl.DateTimeFormat("en-IE", {
	weekday: "long",
});

function isCloseTime(day: string, time: string): boolean {
	// "2024-09-26T12:32:00Z" -> "Thursday"
	const currentDay = dayFormatter.format(currentDate);

	if (currentDay !== day) {
		return false;
	}

	// "09:15" -> [ 9, 15 ]
	const [timetableHours, timetableMinutes] = time.split(":").map(Number);
	// "2024-09-26T12:32:00Z"-> "2024-09-26T09:15:00Z"
	const timetableDate = new Date(
		new Date(currentDate.getTime()).setHours(timetableHours, timetableMinutes),
	);

	// "2024-09-26T09:15:00Z" - "2024-09-26T12:32:00Z" -> 3 hours 17 minutes
	const diffMs = Math.abs(timetableDate.getTime() - currentDate.getTime());
	const diffMins = Math.floor(diffMs / (1000 * 60));

	const isWithinAnHour = diffMins <= 60;

	if (isWithinAnHour) {
		console.dir({
			currentDate,
			timetableDate,
			diffMs,
			diffMins,
			isWithin30Mins: isWithinAnHour,
		});
	}

	// 3 hours 17 minutes < 30 minutes == false
	return isWithinAnHour;
}

const fetchInitData = async () => {
	console.log("Fetching initial data");
	performance.mark("fetchInitData-start");

	const initResp = await fetch(proxiedRoomUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams(defaultRoomData),
	});

	const respText = await initResp.text();
	const parser = new DOMParser();
	const htmlDoc = parser.parseFromString(respText, "text/html");
	console.debug(htmlDoc);

	__VIEWSTATE = (
		htmlDoc.querySelector(
			"input[type='hidden'][name='__VIEWSTATE']",
		) as HTMLInputElement
	).value;
	__VIEWSTATEGENERATOR = (
		htmlDoc.querySelector(
			"input[type='hidden'][name='__VIEWSTATEGENERATOR']",
		) as HTMLInputElement
	).value;
	__EVENTVALIDATION = (
		htmlDoc.querySelector(
			"input[type='hidden'][name='__EVENTVALIDATION']",
		) as HTMLInputElement
	).value;
	console.debug({ __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION });

	const week = (
		htmlDoc.querySelector(
			"select[name='CboWeeks'] > option[selected='selected']",
		) as HTMLOptionElement
	).value;
	const weekInt = Number.parseInt(week, 10);
	console.debug({ week, weekInt });

	allRooms = [
		...htmlDoc.querySelectorAll("select[name='CboLocation'] > option"),
	] as HTMLOptionElement[];
	console.debug(allRooms);

	performance.mark("fetchInitData-end");
	const fetchInitDataMeasure = performance.measure(
		"fetchInitData",
		"fetchInitData-start",
		"fetchInitData-end",
	);
	roundedFetchInitDataDuration = Math.round(fetchInitDataMeasure.duration);
	console.debug(`Fetching initial data took ${roundedFetchInitDataDuration}ms`);
};

const fetchRoomsInSequence = async (rooms: string[]) => {
	console.log("Fetching rooms in sequence");
	performance.mark("fetchRoomsInSequence-start");

	processQueue = {};

	for (const room of rooms) {
		processQueue[room] = null;
	}

	const roomData: TimetableState[] = [];
	for (const room of rooms) {
		processQueue[room] = fetchRoomData(room);
		const roomResp = await processQueue[room];
		roomData.push(roomResp);
	}

	performance.mark("fetchRoomsInSequence-end");
	const fetchRoomsInSequenceMeasure = performance.measure(
		"fetchRoomsInSequence",
		"fetchRoomsInSequence-start",
		"fetchRoomsInSequence-end",
	);
	console.debug(
		`Fetching rooms in sequence took ${Math.round(fetchRoomsInSequenceMeasure.duration)}ms`,
	);

	return roomData;
};

const handleForm = async () => {
	console.log("Handling form submission");
	performance.mark("handleForm-start");

	const roomChoice = document.querySelector(
		"input[name='room-choice']:checked",
	) as HTMLInputElement;

	switch (roomChoice.id) {
		case "it-rooms": {
			console.log("Checking IT rooms");
			roomsToCheck = allRooms
				.filter((room) => room.value.startsWith("IT"))
				.map((room) => room.value);
			break;
		}
		case "use-pattern": {
			console.log("Checking rooms by pattern");
			const pattern = document.querySelector(
				"input[name='pattern']",
			) as HTMLInputElement;
			const patternRegex = new RegExp(pattern.value, "i");
			roomsToCheck = allRooms
				.filter((room) => patternRegex.test(room.value))
				.map((room) => room.value);
			break;
		}
		case "use-room": {
			console.log("Checking specific room");
			const room = document.querySelector(
				"select[name='room'] > option:checked",
			) as HTMLInputElement;
			roomsToCheck = [room.value];
			break;
		}
		default:
			console.error("Unknown room choice");
			return;
	}

	formPromise = fetchRoomsInSequence(roomsToCheck);
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

const processParsedRoomData = (
	parsedRoomData: TimetableState[],
): ProcessedRoomData => {
	console.log("Processing parsed room data");
	performance.mark("processParsedRoomData-start");

	let errorCount = 0;
	let emptyTimetableCount = 0;
	let freeTimesCount = 0;
	let timetableCount = 0;
	const roomsWithErrors: string[] = [];
	// [Monday, Tuesday] - [17:15, 18:15] - [IT101, IT102]
	const freeRoomTable: Record<string, Record<string, string[]>> = {};

	// biome-ignore lint/complexity/noForEach: <explanation>
	parsedRoomData.forEach((timetable) => {
		timetableCount++;

		if (timetable.error) {
			errorCount++;
			console.error(`Found error in timetable for room ${timetable.room}`);
			roomsWithErrors.push(timetable.room);
			return;
		}

		if (timetable.empty) {
			console.debug(`Found empty timetable for room ${timetable.room}`);
			emptyTimetableCount++;
			return;
		}

		for (const day of days) {
			for (const time of timetable.freeTimes[day]) {
				freeTimesCount++;
				if (!freeRoomTable[day]) {
					freeRoomTable[day] = {};
				}
				if (!freeRoomTable[day][time]) {
					freeRoomTable[day][time] = [];
				}
				freeRoomTable[day][time].push(timetable.room);
			}
		}
	});

	console.debug({
		errorCount,
		roomsWithErrors,
		emptyTimetableCount,
		freeTimesCount,
		timetableCount,
		freeRoomTable,
	});

	performance.mark("processParsedRoomData-end");
	const processParsedRoomDataMeasure = performance.measure(
		"processParsedRoomData",
		"processParsedRoomData-start",
		"processParsedRoomData-end",
	);
	console.debug(
		`Processing parsed room data took ${Math.round(processParsedRoomDataMeasure.duration)}ms`,
	);

	return {
		errorCount,
		roomsWithErrors,
		emptyTimetableCount,
		freeTimesCount,
		timetableCount,
		freeRoomTable,
	};
};

const fetchRoomData = async (room: string): Promise<TimetableState> => {
	console.log(`Fetching data for room ${room}`);
	performance.mark("fetchRoomData-start");

	let roomResp: Response;

	try {
		roomResp = await fetch(proxiedRoomUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				...defaultRoomData,
				__VIEWSTATE,
				__VIEWSTATEGENERATOR,
				__EVENTVALIDATION,
				CboLocation: room,
			}),
		});
	} catch (error) {
		console.error(`Failed to fetch room data for ${room}`);
		return {
			error: false,
			fetchError: true,
			fetchTime: -1,
			empty: false,
			freeTimes: {},
			date: "",
			room: room,
			week: "",
		};
	}

	if (!roomResp.ok) {
		console.error(`Failed to fetch room data for ${room}`);
		return {
			error: false,
			fetchError: true,
			fetchTime: -1,
			empty: false,
			freeTimes: {},
			date: "",
			room: room,
			week: "",
		};
	}

	const roomText = await roomResp.text();
	const roomDoc = new DOMParser().parseFromString(roomText, "text/html");
	console.debug(roomDoc);

	console.debug(`Finding free rooms in the week for room ${room}`);
	const parsedTimetableState = parseRoomDoc(roomDoc);

	performance.mark("fetchRoomData-end");
	const fetchRoomDataMeasure = performance.measure(
		"fetchRoomData",
		"fetchRoomData-start",
		"fetchRoomData-end",
	);
	console.debug(
		`Fetching room data for ${room} took ${Math.round(fetchRoomDataMeasure.duration)}ms`,
	);
	parsedTimetableState.fetchTime = Math.round(fetchRoomDataMeasure.duration);

	return parsedTimetableState;
};

const parseRoomDoc = (roomDoc: Document): TimetableState => {
	console.debug("Parsing room document");
	performance.mark("parseRoomDoc-start");

	const timetableState = {
		error: false,
		fetchError: false,
		fetchTime: -1,
		empty: true,
		freeTimes: {},
		date: "",
		room: "",
		week: "",
	};

	const table = roomDoc.querySelector("div#divTT > table:nth-child(1)");

	const date = table
		?.querySelector("tbody > tr:nth-child(1) > td[align='Right'] > b")
		?.textContent?.trim();
	if (date) {
		const splitDate = date.split(" ");
		timetableState.date = splitDate[1];
	} else {
		console.error("Header date is empty");
		timetableState.error = true;
	}

	const room = table
		?.querySelector("tbody > tr:nth-child(3) > td[align='Center'] > b")
		?.textContent?.trim();
	if (room) {
		const splitRoom = room.split(" ");
		timetableState.room = splitRoom[2];
	} else {
		console.error("Header room is empty");
		timetableState.error = true;
	}

	const week = table
		?.querySelector("tbody > tr:nth-child(3) > td[align='Right'] > b")
		?.textContent?.trim();
	if (week) {
		const splitWeek = week.split(" ");
		timetableState.week = splitWeek[2];
	} else {
		console.error("Header week is empty");
		timetableState.error = true;
	}

	const timetable = roomDoc.querySelector("div#divTT > table:nth-child(2)");
	console.debug(timetable);

	const freeTimes: Record<string, string[]> = {};

	let currentDay = -1;

	// biome-ignore lint/complexity/noForEach: <explanation>
	timetable?.querySelectorAll("tr:not(:first-child)").forEach((row) => {
		const dayName = row
			.querySelector("td[colspan='11'] > strong > font > i")
			?.textContent?.trim();

		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		if (days.includes(dayName!)) {
			console.debug(`(Skip) Row contains day: ${dayName}`);
			currentDay++;
			return;
		}

		const subject = row.querySelector("td:nth-of-type(5)")?.textContent?.trim();

		if (subject) {
			console.debug(`(Skip) Row contains subject: ${subject}`);
			timetableState.empty = false;
			return;
		}

		const time = row.querySelector("td:nth-of-type(1)")?.textContent?.trim();

		switch (currentDay) {
			case -1:
				console.error("'currentDay' switch got '-1'");
				timetableState.error = true;
				break;
			default:
				if (!freeTimes[days[currentDay]]) {
					freeTimes[days[currentDay]] = [];
				}
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				freeTimes[days[currentDay]].push(time!);
		}
	});

	timetableState.freeTimes = freeTimes;
	console.debug(timetableState);

	performance.mark("parseRoomDoc-end");
	const parseRoomDocMeasure = performance.measure(
		"parseRoomDoc",
		"parseRoomDoc-start",
		"parseRoomDoc-end",
	);
	console.debug(
		`Parsing room document took ${Math.round(parseRoomDocMeasure.duration)}ms`,
	);

	return timetableState;
};
</script>

<main>
  <img src={appLogo} class="logo" alt="Free WIT Rooms Logo" />
  <h1>Free WIT Rooms</h1>
  <p class="muted-text">
    Check which rooms are free during the week.
  </p>

  {#await initDataPromise}
    <p transition:fade|global={{ duration: 300 }} class="small-text muted-text">Fetching initial data... (this might take a while)</p>
    <Spinner />
  {:then}
    <form in:fade={{ duration: 300 }} on:submit|preventDefault={handleForm}>
      <fieldset>
        <legend>Which rooms to check?</legend>
        <div id="fields">
          <div>
            <input type="radio" id="it-rooms" name="room-choice" checked />
            <label for="it-rooms">IT Rooms</label>
          </div>

		  <div>
            <input type="radio" id="use-pattern" name="room-choice" />
            <label for="use-pattern">
              <label for="pattern">Pattern</label>
              <input type="text" id="pattern" name="pattern" size="5" value="IT10" />
            </label>
          </div>

          <div>
            <input type="radio" id="use-room" name="room-choice" />
            <label for="use-room">
              <label for="room">Room</label>
              <select name="room" id="room">
                {#each allRooms as room}
                  <option value={room.value}>{room.label}</option>
                {/each}
              </select>
            </label>
          </div>
        </div>
      </fieldset>
      <p class="small-text muted-text">(Fetching initial data took {roundedFetchInitDataDuration}ms)</p>
      {#await formPromise}
        <div class="queue" out:fade|global={{ duration: 300 }} in:fade|global={{ delay: 300, duration: 300 }}>
			<p class="small-text muted-text">Finding free rooms... (this might take a while)</p>
					{#if Object.keys(processQueue).length > 0}
						<table>
							<thead>
								<tr>
									<th>Room</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each Object.keys(processQueue) as room}
									<tr>
										<td>{room}</td>
										<td class="queue-result">
											{#if processQueue[room] === null}
												In Queue
											{:else}
												{#await processQueue[room]}
													<Spinner />
												{:then roomPromise}
													{#if roomPromise.error}
														<p>Error</p>
													{:else}
														<div in:fade|global={{ duration: 300 }} class="queue-item-success">
															<p>Success</p>
															<p class="small-text">({roomPromise.fetchTime}ms)</p>
														</div>
													{/if}
												{:catch}
													<p>Error</p>
												{/await}
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
		</div>
      {:then formPromiseData}
        <button out:fade|global={{ duration: 300 }} in:fade|global={{ delay: 300, duration: 300 }} type="submit">Find Free Rooms</button>
		{#if processedRoomData}
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
												<td class:closestTime={isCloseTime(day, time)}>
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
  .error {
    color: red;
    font-size: 0.8em;
  }
  form {
    display: flex;
    flex-direction: column;
    align-items: center;
	width: 100%;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 6px 0px 0px 0px;
    width: fit-content;
    border-radius: 5px;
    border-color: var(--table-border);
  }
  #fields {
    display: flex;
    flex-direction: column;
    gap: 1em;
    margin: 12px;
  }
  #fields > div {
    display: flex;
    gap: 0.5em;
    width: fit-content;
  }
  #fields #room, #fields #pattern {
    margin-left: 0.5em;
    max-width: 10em;
  }
  .muted-text {
	color: var(--more-muted-primary);
  }
  .small-text {
    font-size: 0.8em;
  }
  button[type="submit"] {
    margin: 16px;
	margin-bottom: 32px;
  }
  .queue {
	display: flex;
    flex-direction: column;
    align-items: center;
  }
  .queue-result {
	height: 60px;
	width: 70px;
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
  .table-wrapper {
	/* display: flex;
    flex-direction: row;
    justify-content: center; */
	max-width: 100%;
    overflow-x: auto;
  }
  table {
  border-collapse: collapse;
  border: 2px solid var(--table-border);
  letter-spacing: 1px;
  font-size: 0.8rem;
  margin: 1em 0em;
  }
  td, th {
    border: 1px solid var(--table-border);
    padding: 10px 20px;
  }
  th {
    background-color: var(--tertiary-background);
  }
  td {
    text-align: center;
  }
  tr:nth-child(even) td {
    background-color: var(--secondary-background-striped);
  }
  tr:nth-child(odd) td {
    background-color: var(--secondary-background);
  }
  td.closestTime {
	border: var(--table-border-highlight) solid 2px;
  }
  @media (width <= 768px) {
	h1 {
		font-size: 2.5em;
	}
  }
  @media screen and (orientation: portrait) {
	#rotation-message {
		display: block;
	}
  }
</style>
