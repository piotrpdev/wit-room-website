export const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
Object.freeze(days);

export const times = [
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
Object.freeze(times);

export type TimetableState = {
	error: boolean;
	fetchError: boolean;
	fetchTime: number;
	empty: boolean;
	freeTimes: Record<string, string[]>;
	date: string;
	room: string;
	week: string;
};

export function parseRoomDoc(roomDoc: Document): TimetableState {
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

	const tableRows = timetable?.querySelectorAll("tr:not(:first-child)");

	if (!tableRows) {
		console.error("Couldn't find any table rows");
		timetableState.error = true;
		return timetableState;
	}

	for (const row of tableRows) {
		const dayName = row
			.querySelector("td[colspan='11'] > strong > font > i")
			?.textContent?.trim();

		if (dayName != null && days.includes(dayName)) {
			console.debug(`(Skip) Row contains day: ${dayName}`);
			currentDay++;
			continue;
		}

		const subject = row.querySelector("td:nth-of-type(5)")?.textContent?.trim();

		if (subject) {
			console.debug(`(Skip) Row contains subject: ${subject}`);
			timetableState.empty = false;
			continue;
		}

		const time = row.querySelector("td:nth-of-type(1)")?.textContent?.trim();

		if (!time) {
			console.error("Couldn't find time");
			timetableState.error = true;
			continue;
		}

		switch (currentDay) {
			case -1:
				console.error("'currentDay' switch got '-1'");
				timetableState.error = true;
				break;
			default:
				if (!freeTimes[days[currentDay]]) {
					freeTimes[days[currentDay]] = [];
				}
				freeTimes[days[currentDay]].push(time);
		}
	}

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
}

export type ProcessedRoomData = {
	errorCount: number;
	roomsWithErrors: string[];
	emptyTimetableCount: number;
	freeTimesCount: number;
	timetableCount: number;
	freeRoomTable: Record<string, Record<string, string[]>>;
};

export function processParsedRoomData(
	parsedRoomData: TimetableState[],
): ProcessedRoomData {
	console.log("Processing parsed room data");
	performance.mark("processParsedRoomData-start");

	let errorCount = 0;
	let emptyTimetableCount = 0;
	let freeTimesCount = 0;
	let timetableCount = 0;
	const roomsWithErrors: string[] = [];
	// [Monday, Tuesday] - [17:15, 18:15] - [IT101, IT102]
	const freeRoomTable: Record<string, Record<string, string[]>> = {};

	for (const timetable of parsedRoomData) {
		timetableCount++;

		if (timetable.error) {
			errorCount++;
			console.error(`Found error in timetable for room ${timetable.room}`);
			roomsWithErrors.push(timetable.room);
			continue;
		}

		if (timetable.empty) {
			console.debug(`Found empty timetable for room ${timetable.room}`);
			emptyTimetableCount++;
			continue;
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
	}

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
}

const dayFormatter = new Intl.DateTimeFormat("en-IE", {
	weekday: "long",
});

export function isCloseTime(
	currentDate: Date,
	day: string,
	time: string,
): boolean {
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
