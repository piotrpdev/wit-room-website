import { type TimetableState, parseRoomDoc } from "./processors";

export type PageState = {
	__VIEWSTATE: string;
	__VIEWSTATEGENERATOR: string;
	__EVENTVALIDATION: string;
};

export type InitData = {
	pageState: PageState;
	allRooms: HTMLOptionElement[];
	fetchTime: number;
};

export const emptyInitData: InitData = {
	pageState: {
		__VIEWSTATE: "",
		__VIEWSTATEGENERATOR: "",
		__EVENTVALIDATION: "",
	},
	allRooms: [],
	fetchTime: -1,
};
Object.freeze(emptyInitData);

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

// https://github.com/Rob--W/cors-anywhere/issues/301#issuecomment-1470629190
const corsProxyUrl = "https://cors-proxy.fringe.zone/";
const roomUrl = "https://studentssp.wit.ie/Timetables/RoomTT.aspx";
const proxiedRoomUrl = new URL(corsProxyUrl + roomUrl);
Object.freeze(proxiedRoomUrl);

export async function fetchInitData(): Promise<InitData> {
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

	const __VIEWSTATE = (
		htmlDoc.querySelector(
			"input[type='hidden'][name='__VIEWSTATE']",
		) as HTMLInputElement
	).value;
	const __VIEWSTATEGENERATOR = (
		htmlDoc.querySelector(
			"input[type='hidden'][name='__VIEWSTATEGENERATOR']",
		) as HTMLInputElement
	).value;
	const __EVENTVALIDATION = (
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

	const allRooms = [
		...htmlDoc.querySelectorAll("select[name='CboLocation'] > option"),
	] as HTMLOptionElement[];
	console.debug(allRooms);

	performance.mark("fetchInitData-end");
	const fetchInitDataMeasure = performance.measure(
		"fetchInitData",
		"fetchInitData-start",
		"fetchInitData-end",
	);
	const roundedFetchInitDataDuration = Math.round(
		fetchInitDataMeasure.duration,
	);
	console.debug(`Fetching initial data took ${roundedFetchInitDataDuration}ms`);

	return {
		pageState: {
			__VIEWSTATE,
			__VIEWSTATEGENERATOR,
			__EVENTVALIDATION,
		},
		allRooms,
		fetchTime: roundedFetchInitDataDuration,
	};
}

export type RoomQueue = Record<string, Promise<TimetableState> | null>;
export type RoomQueueEntrySetter = (
	room: string,
	promise: Promise<TimetableState> | null,
) => void;

export async function fetchRoomsInSequence(
	pageState: PageState,
	rooms: string[],
	setRoomQueueEntry: RoomQueueEntrySetter,
): Promise<TimetableState[]> {
	console.log("Fetching rooms in sequence");
	performance.mark("fetchRoomsInSequence-start");

	for (const room of rooms) {
		setRoomQueueEntry(room, null);
	}

	const roomData: TimetableState[] = [];
	for (const room of rooms) {
		const fetchRoomDataPromise = fetchRoomData(pageState, room);
		setRoomQueueEntry(room, fetchRoomDataPromise);

		const roomResp = await fetchRoomDataPromise;
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
}

const fetchRoomData = async (
	pageState: PageState,
	room: string,
): Promise<TimetableState> => {
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
				...pageState,
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
