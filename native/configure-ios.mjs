// Runs on GitHub's Mac after `npx cap add ios`: turns Capacitor's template into
// the CloudPanels iPad app (no clock/battery bar, icon, dark launch screen).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const app = 'ios/App/App';
const plist = join(app, 'Info.plist');
if (!existsSync(plist)) throw new Error('Run `npx cap add ios` first.');
const set = (key, type, value) => execFileSync('plutil', ['-replace', key, `-${type}`, value, plist], { stdio: 'inherit' });

set('CFBundleDisplayName', 'string', 'CloudPanels');
// Hide the clock and battery bar everywhere in the app, like the Panels app.
set('UIStatusBarHidden', 'bool', 'YES');
set('UIViewControllerBasedStatusBarAppearance', 'bool', 'NO');
// A reader wants the whole screen; this also keeps the bar hidden on iPad.
set('UIRequiresFullScreen', 'bool', 'YES');
set('UISupportedInterfaceOrientations~ipad', 'json', JSON.stringify(['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']));
set('UISupportedInterfaceOrientations', 'json', JSON.stringify(['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']));

// App icon: one 1024×1024 image (Xcode makes every size from it).
const iconSet = join(app, 'Assets.xcassets/AppIcon.appiconset');
for (const name of existsSync(iconSet) ? readdirSync(iconSet) : []) rmSync(join(iconSet, name));
mkdirSync(iconSet, { recursive: true });
copyFileSync('resources/AppIcon-1024.png', join(iconSet, 'AppIcon-1024.png'));
writeFileSync(join(iconSet, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));

// Launch screen: the reader's dark background with the emblem (no white flash).
const splashSet = join(app, 'Assets.xcassets/Splash.imageset');
if (existsSync(splashSet)) {
  const contents = JSON.parse(readFileSync(join(splashSet, 'Contents.json'), 'utf8'));
  for (const image of contents.images || []) if (image.filename) copyFileSync('resources/splash-2732.png', join(splashSet, image.filename));
}
const storyboard = join(app, 'Base.lproj/LaunchScreen.storyboard');
if (existsSync(storyboard)) {
  // Fill the space around the image with the same dark colour.
  let xml = readFileSync(storyboard, 'utf8');
  xml = xml.replace(/<color key="backgroundColor"[^>]*\/>/g, '<color key="backgroundColor" red="0.0118" green="0.0275" blue="0.0431" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>');
  writeFileSync(storyboard, xml);
}

// Version shown in TestFlight: the web app's version.
const version = (() => { try { return JSON.parse(readFileSync('../package.json', 'utf8')).version; } catch { return '1.0.0'; } })();
const project = join('ios/App/App.xcodeproj/project.pbxproj');
let pbx = readFileSync(project, 'utf8');
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
pbx = pbx.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/g, 'TARGETED_DEVICE_FAMILY = "1,2";');
writeFileSync(project, pbx);
console.log(`CloudPanels iPad project ready (version ${version}).`);
