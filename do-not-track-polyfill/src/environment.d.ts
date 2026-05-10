declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/**
			 * @description A proposed unified standard for opting out of telemetry for TUI/console apps.
			 */
			DO_NOT_TRACK?: string;
		}
	}
}

export {};
