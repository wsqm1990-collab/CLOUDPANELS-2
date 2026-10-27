# Opens the freshly built app in an iPad simulator on GitHub's Mac and saves
# screenshots and the app's console output into results/ for review.
import json, os, subprocess, sys, time

def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True).stdout

bundle = json.load(open('native/capacitor.config.json'))['appId']
app = 'build/Build/Products/Debug-iphonesimulator/App.app'
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
ipads = [(runtime, device) for runtime, items in devices.items() if 'iOS' in runtime for device in items if device['name'].startswith('iPad')]
if not ipads:
    sys.exit('No iPad simulator available')
# Prefer a regular iPad (closest to an iPad 9th generation) on the newest system.
ipads.sort(key=lambda item: (item[1]['name'].startswith('iPad ('), item[0]))
runtime, device = ipads[-1]
udid = device['udid']
print('Simulator:', device['name'], runtime)
open('results/simulator.txt', 'w').write(f"{device['name']} {runtime}\n")
run('xcrun', 'simctl', 'boot', udid, check=False)
run('xcrun', 'simctl', 'bootstatus', udid, '-b')
run('xcrun', 'simctl', 'install', udid, app)
console = open('results/console.txt', 'w')
proc = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console-pty', '--terminate-running-process', udid, bundle], stdout=console, stderr=subprocess.STDOUT)
for seconds, name in [(6, '01-start'), (20, '02-after-20s')]:
    time.sleep(seconds)
    run('xcrun', 'simctl', 'io', udid, 'screenshot', f'results/{name}.png')
proc.terminate()
try:
    proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    proc.kill()
console.close()
log = subprocess.run(['xcrun', 'simctl', 'spawn', udid, 'log', 'show', '--last', '3m', '--style', 'compact', '--predicate', 'process == "App"'], capture_output=True, text=True).stdout
open('results/system-log.txt', 'w').write(log[-300000:])
print('Screenshots saved')
