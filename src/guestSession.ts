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
		this.log.info('Starting HostSession');
		this.init();
	}

	async init(): Promise<void> {

		this.log.info('Getting shared service');
		const service = await this.liveShare.getSharedService(serviceName);
		if (service) {

			service.onNotify('registerAdapter', (args: { adapterId: number }) => {
				const adapterId = args.adapterId;
				const adapter = new TestAdapterProxy(adapterId, this.testExplorer, service);
				this.adapters.set(adapterId, adapter);
			});

			service.onNotify('unregisterAdapter', (args: { adapterId: number }) => {
				const adapterId = args.adapterId;
				const adapter = this.adapters.get(adapterId);
				if (adapter) {
					this.adapters.delete(adapterId);
					adapter.dispose();
				}
			});
		} else {
			this.log.info('Getting shared service failed');
		}
	}

	dispose() {
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
		private readonly sharedService: vsls.SharedServiceProxy
	) {
		this.testExplorer.registerAdapter(this);
	}

	async load(): Promise<TestSuiteInfo | undefined> {
		return this.sharedService.request('load', [ this.adapterId ]);
	}

	async run(tests: TestSuiteInfo | TestInfo): Promise<void> {
		return this.sharedService.request('run', [ this.adapterId, tests ]);
	}

	async debug(tests: TestSuiteInfo | TestInfo): Promise<void> {
		return this.sharedService.request('debug', [ this.adapterId, tests ]);
	}

	cancel(): void {
		this.sharedService.request('cancel', [ this.adapterId ]);
	}

	dispose() {

	}
}