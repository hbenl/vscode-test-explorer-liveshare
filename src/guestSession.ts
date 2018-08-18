import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestHub, TestSuiteInfo, TestInfo, TestEvent, TestSuiteEvent, TestAdapter, TestRunStartedEvent, TestRunFinishedEvent, TestLoadStartedEvent, TestLoadFinishedEvent } from 'vscode-test-adapter-api';
import { Log } from './log';

export class GuestSessionManager {

	private adapterProxies = new Map<number, TestAdapterProxy>();

	constructor(
		context: vscode.ExtensionContext,
		private readonly testHub: TestHub,
		private readonly sharedServiceProxy: vsls.SharedServiceProxy,
		private readonly log: Log
	) {

		sharedServiceProxy.onNotify('registerAdapter', (args: { adapterId: number }) => {
			this.log.info(`Received registerAdapter notification: ${JSON.stringify(args)}`);
			const adapterId = args.adapterId;
			const proxy = new TestAdapterProxy(adapterId, sharedServiceProxy, this.log);
			this.adapterProxies.set(adapterId, proxy);
			this.testHub.registerTestAdapter(proxy);
		});

		sharedServiceProxy.onNotify('unregisterAdapter', (args: { adapterId: number }) => {
			this.log.info(`Received unregisterAdapter notification: ${JSON.stringify(args)}`);
			const adapterId = args.adapterId;
			const proxy = this.adapterProxies.get(adapterId);
			if (proxy) {
				this.testHub.unregisterTestAdapter(proxy);
				this.adapterProxies.delete(adapterId);
			}
		});

		sharedServiceProxy.onNotify('tests', (args: { adapterId: number, event: TestLoadStartedEvent | TestLoadFinishedEvent }) => {
			this.log.debug(`Received TestLoad event for adapter #${args.adapterId}: ${JSON.stringify(args.event)}`);
			const proxy = this.adapterProxies.get(args.adapterId);
			if (proxy) {
				proxy.testsEmitter.fire(args.event);
			}
		});

		sharedServiceProxy.onNotify('testState', (args: { adapterId: number, event: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent }) => {
			this.log.debug(`Received TestRun event for adapter #${args.adapterId}: ${JSON.stringify(args.event)}`);
			const proxy = this.adapterProxies.get(args.adapterId);
			if (proxy) {
				proxy.testStatesEmitter.fire(args.event);
			}
		});

		if (sharedServiceProxy.isServiceAvailable) {
			this.startSession();
		}
		context.subscriptions.push(sharedServiceProxy.onDidChangeIsServiceAvailable(available => {
			available ? this.startSession() : this.endSession();
		}));
	}

	private async startSession(): Promise<void> {

		const initialAdapters: { adapterId: number, tests?: TestSuiteInfo }[] = await this.sharedServiceProxy.request('adapters', []);
		this.log.info(`Received adapters response: ${JSON.stringify(initialAdapters)}`);

		for (const adapter of initialAdapters) {

			const proxy = new TestAdapterProxy(adapter.adapterId, this.sharedServiceProxy, this.log);
			this.adapterProxies.set(adapter.adapterId, proxy);
			this.testHub.registerTestAdapter(proxy);

			proxy.testsEmitter.fire({ type: 'started' });
			if (adapter.hasOwnProperty('tests')) {
				proxy.testsEmitter.fire({ type: 'finished', suite: adapter.tests });
			}
		}
	}

	private endSession(): void {
		this.adapterProxies.forEach(proxy => {
			this.testHub.unregisterTestAdapter(proxy);
		});
		this.adapterProxies.clear();
	}
}

class TestAdapterProxy implements TestAdapter {

	public readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	public readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();

	constructor(
		private readonly adapterId: number,
		private readonly sharedService: vsls.SharedServiceProxy,
		private readonly log: Log
	) {}

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
}
