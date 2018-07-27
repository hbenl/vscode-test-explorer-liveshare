import * as vsls from 'vsls/vscode';
import { TestExplorerExtension } from 'vscode-test-adapter-api';
import { HostSession } from './hostSession';
import { GuestSession } from './guestSession';
import { Log } from './log';

export const serviceName = 'hbenl.vscode-share-test-explorer';

export interface Session {
	dispose(): void;
}

export class SessionManager {

	private currentSession: Session | undefined;

	constructor(
		private readonly testExplorer: TestExplorerExtension,
		private readonly liveShare: vsls.LiveShare,
		private readonly log: Log
	) {}

	onSessionChanged(session: vsls.Session): void {

		this.log.info(`Session changed: ${JSON.stringify(session)}`);

		if (this.currentSession) {
			this.currentSession.dispose();
			this.currentSession = undefined;
		}

		if (session.id && (session.role !== vsls.Role.None)) {

			if (session.role === vsls.Role.Host) {

				this.currentSession = new HostSession(this.testExplorer, this.liveShare, this.log);

			} else if (session.role === vsls.Role.Guest) {

				this.currentSession = new GuestSession(this.testExplorer, this.liveShare, this.log);

			}
		}
	}
}
