const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function addGoogleRedirect(source) {
  const marker = '  // Extension point for config plugins';
  const handler = `  override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach { context in
      if !GIDSignIn.sharedInstance.handle(context.url) {
        super.scene(scene, openURLContexts: URLContexts)
      }
    }
  }
`;
  if (source.includes('GIDSignIn.sharedInstance.handle(context.url)')) return source;
  if (!source.includes(marker)) {
    throw new Error('Google redirect: SceneDelegate layout changed; update the URL handler plugin before building iOS.');
  }
  source = source.replace(marker, `${marker}\n${handler}`).replace(/\n\.\s*\n\}/, '\n}');
  return /^import GoogleSignIn$/m.test(source) ? source : `import GoogleSignIn\n${source}`;
}

module.exports = config => withDangerousMod(config, ['ios', async config => {
  const file = path.join(config.modRequest.platformProjectRoot, 'Sonora', 'SceneDelegate.swift');
  const source = await fs.promises.readFile(file, 'utf8');
  await fs.promises.writeFile(file, addGoogleRedirect(source));
  return config;
}]);
module.exports.addGoogleRedirect = addGoogleRedirect;
