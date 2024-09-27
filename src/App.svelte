<script lang="ts">
import { onMount } from "svelte";
import appLogo from "/favicon.svg";
import PWABadge from "./lib/PWABadge.svelte";
import Spinner from "./lib/Spinner.svelte";

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

let __VIEWSTATE = "";
let __VIEWSTATEGENERATOR = "";
let __EVENTVALIDATION = "";

let allRooms: HTMLOptionElement[] = [];

// TODO: Handle errors / optional chaining

let roundedFetchInitDataDuration = 0;

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

let formPromise: Promise<void>;

const handleForm = async () => {
	console.log("Handling form submission");
	performance.mark("handleForm-start");

	const roomChoice = document.querySelector(
		"input[name='room-choice']:checked",
	) as HTMLInputElement;

	switch (roomChoice.id) {
		case "it-rooms":
			console.log("Checking IT rooms");
			formPromise = fetchRoomData("IT101");
			break;
		case "use-room": {
			const room = document.querySelector(
				"select[name='room'] > option:checked",
			) as HTMLInputElement;
			console.log(`Checking specific room ${room.value}`);
			formPromise = fetchRoomData(room.value);
			break;
		}
		default:
			console.error("Unknown room choice");
			return;
	}

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

const fetchRoomData = async (room: string) => {
	console.log(`Fetching data for room ${room}`);
	performance.mark("fetchRoomData-start");

	const roomResp = await fetch(proxiedRoomUrl, {
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

	const roomText = await roomResp.text();
	const roomDoc = new DOMParser().parseFromString(roomText, "text/html");
	console.debug(roomDoc);

	console.debug(`Finding free rooms in the week for room ${room}`);
	parseRoomDoc(roomDoc);

	performance.mark("fetchRoomData-end");
	const fetchRoomDataMeasure = performance.measure(
		"fetchRoomData",
		"fetchRoomData-start",
		"fetchRoomData-end",
	);
	console.debug(
		`Fetching room data for ${room} took ${Math.round(fetchRoomDataMeasure.duration)}ms`,
	);
};

const parseRoomDoc = (roomDoc: Document) => {
	console.debug("Parsing room document");
	performance.mark("parseRoomDoc-start");

	const timetableState = {
		error: false,
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

let initDataPromise: Promise<void>;

onMount(() => {
	initDataPromise = fetchInitData();
});
</script>

<main>
  <img src={appLogo} class="logo" alt="Free WIT Rooms Logo" />
  <h1>Free WIT Rooms</h1>
  <p class="tagline">
    Check which WIT rooms are free during the week.
  </p>

  {#await initDataPromise}
    <p class="small-grey-text">Fetching initial data... (this might take a while)</p>
    <Spinner />
  {:then}
    <form on:submit|preventDefault={handleForm}>
      <fieldset>
        <legend>Which rooms to check?</legend>
        <div id="fields">
          <div>
            <input type="radio" id="it-rooms" name="room-choice" checked />
            <label for="it-rooms">IT Rooms</label>
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
      <p class="small-grey-text">(Fetching initial data took {roundedFetchInitDataDuration}ms)</p>
      {#await formPromise}
        <p class="small-grey-text">Finding free rooms... (this might take a while)</p>
        <Spinner />
      {:then}
        <button type="submit">Find Free Rooms</button>
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
  .tagline {
    color: var(--half-dark);
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
  }
  fieldset {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 12px 0px 0px 0px;
    width: fit-content;
    border-radius: 5px;
    border-color: var(--half-dark);
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
  #fields #room {
    margin-left: 0.5em;
    max-width: 5em;
  }
  .small-grey-text {
    color: var(--half-dark);
    font-size: 0.8em;
  }
  button[type="submit"] {
    margin-top: 24px;
  }
</style>
