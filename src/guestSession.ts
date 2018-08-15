import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestExplorerExtension, TestSuiteInfo, TestInfo, TestEvent, TestSuiteEvent, TestAdapterDelegate, TestRunStartedEvent, TestRunFinishedEvent, TestLoadStartedEvent, TestLoadFinishedEvent } from 'vscode-test-adapter-api';
import { Session, serviceName } from './sessionManager';
import { Log } from './log';

export class GuestSession implements Session {

	private adapterProxies = new Map<number, TestAdapterProxy>();

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

			const initialAdapters = await service.request('adapters', []);
			this.log.info(`Received adapters response: ${JSON.stringify(initialAdapters)}`);
			for (const adapterId of initialAdapters) {
				const proxy = new TestAdapterProxy(adapterId, service, this.log);
				this.adapterProxies.set(adapterId, proxy);
				this.testExplorer.registerAdapterDelegate(proxy);
			}

			service.onNotify('registerAdapter', (args: { adapterId: number }) => {
				this.log.info(`Received registerAdapter notification: ${JSON.stringify(args)}`);
				const adapterId = args.adapterId;
				const proxy = new TestAdapterProxy(adapterId, service, this.log);
				this.adapterProxies.set(adapterId, proxy);
				this.testExplorer.registerAdapterDelegate(proxy);
			});

			service.onNotify('unregisterAdapter', (args: { adapterId: number }) => {
				this.log.info(`Received unregisterAdapter notification: ${JSON.stringify(args)}`);
				const adapterId = args.adapterId;
				const proxy = this.adapterProxies.get(adapterId);
				if (proxy) {
					this.adapterProxies.delete(adapterId);
					proxy.dispose();
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

class TestAdapterProxy implements TestAdapterDelegate {

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();

	constructor(
		private readonly adapterId: number,
		private readonly sharedService: vsls.SharedServiceProxy,
		private readonly log: Log
	) {
		this.log.info(`Creating TestAdapterProxy #${adapterId}`);

		this.sharedService.onNotify('tests', (args: { adapterId: number, event: TestLoadStartedEvent | TestLoadFinishedEvent }) => {
			if (args.adapterId === this.adapterId) {
				this.log.debug(`Received TestLoad event for adapter #${this.adapterId}: ${JSON.stringify(args.event)}`);
				this.testsEmitter.fire(args.event);
			}
		});

		this.sharedService.onNotify('testState', (args: { adapterId: number, event: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent }) => {
			if (args.adapterId === this.adapterId) {
				this.log.debug(`Received TestRun event for adapter #${this.adapterId}: ${JSON.stringify(args.event)}`);
				this.testStatesEmitter.fire(args.event);
			}
		});
	}

	async load(): Promise<void> {
		this.log.debug(`Passing on load request for adapter #${this.adapterId}`);
		return this.sharedService.request('load', [ this.adapterId ]);
	}

	async run(tests: TestSuiteInfo | TestInfo): Promise<void> {
		this.log.debug(`Passing on run request for adapter #${this.adapterId}`);
		return this.sharedService.request('run', [ this.adapterId, tests ]);
	}

	async debug(tests: TestSuiteInfo | TestInfo): Promise<void> {
		this.log.debug(`Passing on debug request for adapter #${this.adapterId}`);
		return this.sharedService.request('debug', [ this.adapterId, tests ]);
	}

	cancel(): void {
		this.log.debug(`Passing on cancel request for adapter #${this.adapterId}`);
		this.sharedService.request('cancel', [ this.adapterId ]);
	}

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testsEmitter.event;
	}

	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	dispose() {
		this.log.info(`Disposing TestAdapterProxy #${this.adapterId}`);
	}
}
