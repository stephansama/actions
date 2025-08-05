declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/**
			 * @see https://consoledonottrack.com/
			 * @description A proposed unified standard for opting out of telemetry for TUI/console apps.
			 */
			DO_NOT_TRACK?: string;
		}
	}
}

export {};
