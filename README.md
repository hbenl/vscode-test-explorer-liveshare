# Test Explorer Live Share for Visual Studio Code

This extension adds support for [VS Live Share](https://aka.ms/vsls) to the
[Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Configuration

The extension needs to be installed by all participants of the VS Live Share session. Now the guests of a VS Live Share session will be able to see and interact with the host's tests.

## Known limitations

* the Code Lenses for starting the tests are currently not shown on the guest side of the session.
  Guests will have to use the Test Explorer view or its 
  [commands](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer#user-content-commands)
  for starting the tests.
* only the events from the Test Adapters are shared between the host and the guests. This means
  that if the host or a guest enables autorun or resets/retires the test states, this will not
  be visible to the other participants of the session.

## Troubleshooting

The extension creates an Output Channel called `Test Explorer Live Share` containing detailed logs.
If you can't figure out why something isn't working, please 
[file a bug report](https://github.com/hbenl/vscode-test-explorer-liveshare/issues) and include these logs.
