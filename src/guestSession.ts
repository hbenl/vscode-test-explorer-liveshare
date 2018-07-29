import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestExplorerExtension, TestAdapter, TestSuiteInfo, TestInfo, TestEvent, TestSuiteEvent } from 'vscode-test-adapter-api';
import { Session, serviceName } from './sessionManager';
import { Log } from './log';

export class GuestSession implements Session {

	private adapters = new Map<number, TestAdapterProxy>();

	constructor(
		private readonly testExplorer: TestExplorerExtension,
		private readonly liveShare: vsls.LiveShare,
		private readonly log: Log
	) {
		this.log.info('Starting GuestSession');
		this.init();
	}

	async init(): Promise<void> {

		this.log.info('Getting shared service');
		const service = await this.liveShare.getSharedService(serviceName);
		if (service) {

			this.log.info(`sharedService is ${service.isServiceAvailable ? '' : 'not '}available`);

			service.onNotify('registerAdapter', (args: { adapterId: number }) => {
				this.log.info(`Received registerAdapter notification: ${JSON.stringify(args)}`);
				const adapterId = args.adapterId;
				const adapter = new TestAdapterProxy(adapterId, this.testExplorer, service, this.log);
				this.adapters.set(adapterId, adapter);
			});

			service.onNotify('unregisterAdapter', (args: { adapterId: number }) => {
				this.log.info(`Received unregisterAdapter notification: ${JSON.stringify(args)}`);
				const adapterId = args.adapterId;
				const adapter = this.adapters.get(adapterId);
				if (adapter) {
					this.adapters.delete(adapterId);
					adapter.dispose();
				}
			});
		} else {
			this.log.error('Getting shared service failed');
		}
	}

	dispose() {
		this.log.info('Disposing GuestSession');
	}
}

class TestAdapterProxy implements TestAdapter {

	private readonly testStatesEmitter = new vscode.EventEmitter<TestSuiteEvent | TestEvent>();
	get testStates(): vscode.Event<TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	constructor(
		private readonly adapterId: number,
		private readonly testExplorer: TestExplorerExtension,
		private readonly sharedService: vsls.SharedServiceProxy,
		private readonly log: Log
	) {
		this.log.info(`Creating TestAdapterProxy #${adapterId}`);
		this.testExplorer.registerAdapter(this);
	}

	async load(): Promise<TestSuiteInfo | undefined> {
		this.log.debug(`Passing on load request for adapter #${this.adapterId}`)
		return this.sharedService.request('load', [ this.adapterId ]);
	}

	async run(tests: TestSuiteInfo | TestInfo): Promise<void> {
		this.log.debug(`Passing on run request for adapter #${this.adapterId}`)
		return this.sharedService.request('run', [ this.adapterId, tests ]);
	}

	async debug(tests: TestSuiteInfo | TestInfo): Promise<void> {
		this.log.debug(`Passing on debug request for adapter #${this.adapterId}`)
		return this.sharedService.request('debug', [ this.adapterId, tests ]);
	}

	cancel(): void {
		this.log.debug(`Passing on cancel request for adapter #${this.adapterId}`)
		this.sharedService.request('cancel', [ this.adapterId ]);
	}

	dispose() {
		this.log.info(`Disposing TestAdapterProxy #${this.adapterId}`);
	}
}