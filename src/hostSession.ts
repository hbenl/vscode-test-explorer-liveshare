import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestHub, TestController, TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Log } from './log';

export class HostSessionManager implements TestController {

	private adapters = new Map<number, TestAdapter>();
	private adapterSubscriptions = new Map<number, vscode.Disposable[]>();
	private tests = new Map<number, TestSuiteInfo | undefined>();
	private nextAdapterId = 0;

	constructor(
		context: vscode.ExtensionContext,
		private readonly testHub: TestHub,
		private readonly liveShare: vsls.LiveShare,
		private readonly sharedService: vsls.SharedService,
		private readonly log: Log
	) {

		this.sharedService.onRequest('adapters', () => {
			this.log.debug('Received adapters request');

			const adapterIds = [ ...this.adapters.keys() ];
			const response = adapterIds.map(adapterId => {
				if (this.tests.has(adapterId)) {
					return { adapterId, tests: this.tests.get(adapterId) || null }
				} else {
					return { adapterId };
				}
			});

			this.log.debug(`Sending adapters response: ${JSON.stringify(response)}`);
			return response;
		});

		this.sharedService.onRequest('load', (args) => {
			this.log.debug('Received load request...');
			return this.adapterRequest(args, adapter => adapter.load());
		});

		this.sharedService.onRequest('run', (args) => {
			this.log.debug('Received run request...');
			return this.adapterRequest(args, adapter => adapter.run(args[1]));
		});

		this.sharedService.onRequest('debug', (args) => {
			this.log.debug('Received debug request...');
			return this.adapterRequest(args, adapter => adapter.debug(args[1]));
		});

		this.sharedService.onRequest('cancel', (args) => {
			this.log.debug('Received cancel request...');
			this.adapterRequest(args, adapter => adapter.cancel());
		});

		if (sharedService.isServiceAvailable) {
			this.startSession();
		}
		context.subscriptions.push(sharedService.onDidChangeIsServiceAvailable(available => {
			available ? this.startSession() : this.endSession();
		}));
	}

	registerTestAdapter(adapter: TestAdapter): void {

		const adapterId = this.nextAdapterId++;
		this.log.info(`Registering Adapter #${adapterId}`);
		this.adapters.set(adapterId, adapter);

		const subscriptions: vscode.Disposable[] = [];

		subscriptions.push(adapter.tests(event => {

			const convertedEvent = this.convertTestLoadEvent(event);

			if (convertedEvent.type === 'started') {
				this.tests.delete(adapterId);
			} else { // convertedEvent.type === 'finished'
				this.tests.set(adapterId, convertedEvent.suite);
			}

			this.log.info(`Passing on TestLoad event for Adapter #${adapterId}: ${JSON.stringify(event)}`);
			this.sharedService.notify('tests', { adapterId, event: convertedEvent });
		}));

		subscriptions.push(adapter.testStates(event => {
			this.log.info(`Passing on TestRun event for Adapter #${adapterId}: ${JSON.stringify(event)}`);
			this.sharedService.notify('testState', { adapterId, event: this.convertTestRunEvent(event) });
		}));

		this.adapterSubscriptions.set(adapterId, subscriptions);

		this.sharedService.notify('registerAdapter', { adapterId });
	}

	unregisterTestAdapter(adapter: TestAdapter): void {

		for (const [ adapterId, _adapter ] of this.adapters) {
			if (_adapter === adapter) {
				this.log.info(`Unregistering Adapter #${adapterId}`);

				this.sharedService.notify('unregisterAdapter', { adapterId });

				const subscriptions = this.adapterSubscriptions.get(adapterId);
				if (subscriptions) {
					subscriptions.forEach(subscription => subscription.dispose());
				}

				this.adapters.delete(adapterId);
				this.adapterSubscriptions.delete(adapterId);
				this.tests.delete(adapterId);

				return;
			}
		}

		this.log.warn('Tried to unregister unknown Adapter');
	}

	private startSession(): void {
		this.log.info('Starting Host session');
		this.testHub.registerTestController(this);
	}

	private endSession(): void {
		this.testHub.unregisterTestController(this);
		this.log.info('Host session finished');
	}

	private adapterRequest(args: any[], action: (adapter: TestAdapter) => any): any {

		const adapterId = args[0];
		const adapter = this.adapters.get(adapterId);
		if (adapter) {
			this.log.debug(`...for adapter #${adapterId}`);
			return action(adapter);
		} else {
			this.log.warn(`...for unknown adapter #${adapterId}`);
		}

		return undefined;
	}

	private convertTestLoadEvent(event: TestLoadStartedEvent | TestLoadFinishedEvent): TestLoadStartedEvent | TestLoadFinishedEvent {
		if ((event.type === 'finished') && (event.suite)) {
			return { ...event, suite: <TestSuiteInfo>this.convertInfo(event.suite) };
		} else {
			return event;
		}
	}

	private convertTestRunEvent(event: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent): any {
		if (event.type === 'started') {
			return { ...event, tests: event.tests };
		} else if ((event.type === 'suite') && (typeof event.suite === 'object')) {
			return { ...event, suite: this.convertInfo(event.suite) };
		} else if ((event.type === 'test') && (typeof event.test === 'object')) {
			return { ...event, test: this.convertInfo(event.test) };
		} else {
			return event;
		}
	}

	private convertInfo(info: TestSuiteInfo | TestInfo): TestSuiteInfo | TestInfo {

		let file = info.file;
		if (file) {
			try {
				file = this.liveShare.convertLocalUriToShared(vscode.Uri.file(file)).toString();
			} catch (e) {
				this.log.error(`Failed converting ${file} to shared URI: ${e}`);
			}
		}

		const children = (info.type === 'suite') ? info.children.map(child => this.convertInfo(child)) : undefined;

		return { ...<any>info, file, children };
	}
}
