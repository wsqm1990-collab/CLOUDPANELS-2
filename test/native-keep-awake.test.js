import test from 'node:test';
import assert from 'node:assert/strict';
import { addKeepAwake } from '../native/keep-awake-swift.mjs';

const TEMPLATE = `import UIKit
import Capacitor

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }
}
`;

test('the iPad app delegate starts the keep-awake handler at launch, once', () => {
  const patched = addKeepAwake(TEMPLATE);
  assert.match(patched, /^import WebKit\n/);
  assert.match(patched, /didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\?\) -> Bool \{\n        CloudPanelsKeepAwake\.shared\.start\(\)\n/);
  assert.match(patched, /final class CloudPanelsKeepAwake: NSObject, WKScriptMessageHandler/);
  assert.match(patched, /userContentController\.add\(self, name: "keepAwake"\)/);
  assert.match(patched, /UIApplication\.shared\.isIdleTimerDisabled = on/);
  // The original code is kept, and patching twice changes nothing.
  assert.ok(patched.includes('return true'));
  assert.equal(addKeepAwake(patched), patched);
  assert.equal(patched.split('CloudPanelsKeepAwake.shared.start()').length, 2);
  // Swift braces stay balanced.
  assert.equal((patched.match(/\{/g) || []).length, (patched.match(/\}/g) || []).length);
});

test('a template without the launch method is reported instead of silently skipped', () => {
  assert.throws(() => addKeepAwake('import UIKit\nclass AppDelegate {}\n'), /didFinishLaunchingWithOptions/);
});
