const fs = require('fs');
let content = fs.readFileSync(
  '/root/S/pos-s/src/app/session/GateScreen.jsx',
  'utf8',
);

// Hide Ebirr button if canStartTrial
content = content.replace(
  /<button\s+className="button primary"\s+disabled=\{activationState\.loading\}\s+onClick=\{\(\) => \{\s+void handleStartActivation\(\);\s+\}\}\s+type="button"\s*>\s*\{activationState\.loading \? 'Starting Ebirr activation…' : 'Pay 1,900 ETB with Ebirr'\}\s*<\/button>/g,
  `{!selectedActivationCandidate?.canStartTrial ? (<button
  className="button secondary"
  disabled={activationState.loading}
  onClick={() => {
    void handleStartActivation();
  }}
  type="button"
>
  {activationState.loading ? 'Starting Ebirr activation…' : 'Pay 1,900 ETB with Ebirr'}
</button>) : null}`,
);

fs.writeFileSync('/root/S/pos-s/src/app/session/GateScreen.jsx', content);
