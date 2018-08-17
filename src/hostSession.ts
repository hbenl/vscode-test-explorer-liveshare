import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestExplorerExtension, TestController, TestAdapterDelegate, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Log } from './log';

export class HostSessionManager implements TestController {

	private adapters = new Map<number, TestAdapterDelegate>();
	private adapterSubscriptions = new Map<number, vscode.Disposable[]>();
	private tests = new Map<number, TestSuiteInfo | undefined>();
	private nextAdapterId = 0;

	constructor(
		context: vscode.ExtensionContext,
		private readonly testExplorer: TestExplorerExtension,
		private readonly liveShare: vsls.LiveShare,
		private readonly sharedService: vsls.SharedService,
		private readonly log: Log
	) {

		this.sharedService.onRequest('adapters', () => {
			this.log.debug('Received adapters request');

			const adapterIds = [ ...this.adapters.keys() ];
			const response = adapterIds.map(adapterId => {
				if (this.tests.has(adapterId)) {
					return { adapterId, tests: this.tests.get(adapterId) }
				} else {
					return { adapterId };
				}
			});

			this.log.debug(`Sending adapters response: ${JSON.stringify(response)}`);
			return response;
		});

		this.sharedService.onRequest('load', (dummy, args) => {
			this.log.debug('Received load request...');
			return this.adapterRequest(<any>args, adapter => adapter.load());
		});

		this.sharedService.onRequest('run', (dummy, args) => {
			this.log.debug('Received run request...');
			return this.adapterRequest(<any>args, adapter => adapter.run(this.convertInfoFromGuest((<any>args)[1])));
		});

		this.sharedService.onRequest('debug', (dummy, args) => {
			this.log.debug('Received debug request...');
			return this.adapterRequest(<any>args, adapter => adapter.debug(this.convertInfoFromGuest((<any>args)[1])));
		});

		this.sharedService.onRequest('cancel', (dummy, args) => {
			this.log.debug('Received cancel request...');
			this.adapterRequest(<any>args, adapter => adapter.cancel());
		});

		if (sharedService.isServiceAvailable) {
			this.startSession();
		}
		context.subscriptions.push(sharedService.onDidChangeIsServiceAvailable(available => {
			available ? this.startSession() : this.endSession();
		}));
	}

	registerAdapterDelegate(adapter: TestAdapterDelegate): void {

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

	unregisterAdapterDelegate(adapter: TestAdapterDelegate): void {

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
		this.testExplorer.registerController(this);
	}

	private endSession(): void {
		this.testExplorer.unregisterController(this);
	}

	private adapterRequest(args: any[], action: (adapter: TestAdapterDelegate) => any): any {

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
			return { ...event, tests: this.convertInfo(event.tests) };
		} else if ((event.type === 'suite') && (typeof event.suite === 'object')) {
			return { ...event, suite: this.convertInfo(event.suite) };
		} else if ((event.type === 'test') && (typeof event.test === 'object')) {
			return { ...event, test: this.convertInfo(event.test) };
		} else {
			return event;
		}
	}

	private convertInfo(info: TestSuiteInfo | TestInfo): TestSuiteInfo | TestInfo {
		const file = info.file ? this.liveShare.convertLocalUriToShared(vscode.Uri.file(info.file)).toString() : undefined;
		const children = (info.type === 'suite') ? info.children.map(child => this.convertInfo(child)) : undefined;
		return { ...<any>info, file, children };
	}

	private convertInfoFromGuest(info: TestSuiteInfo | TestInfo): TestSuiteInfo | TestInfo {
		const file = info.file ? this.liveShare.convertSharedUriToLocal(vscode.Uri.parse(info.file)).path : undefined;
		const children = (info.type === 'suite') ? info.children.map(child => this.convertInfoFromGuest(child)) : undefined;
		return { ...<any>info, file, children };
	}
}
