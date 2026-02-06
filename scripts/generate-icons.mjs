import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Android icon sizes
const ANDROID_ICONS = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Adaptive icon sizes (foreground needs to be larger for the safe zone)
const ADAPTIVE_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const androidResPath = join(projectRoot, 'android/app/src/main/res');

async function generateIcons() {
  const svgBuffer = readFileSync(join(projectRoot, 'icon-source.svg'));

  console.log('Generating Android icons...');

  // Generate legacy icons (ic_launcher.png)
  for (const [folder, size] of Object.entries(ANDROID_ICONS)) {
    const outputPath = join(androidResPath, folder, 'ic_launcher.png');
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`  Created ${folder}/ic_launcher.png (${size}x${size})`);
  }

  // Generate round icons (ic_launcher_round.png) - same as regular for our circular icon
  for (const [folder, size] of Object.entries(ANDROID_ICONS)) {
    const outputPath = join(androidResPath, folder, 'ic_launcher_round.png');
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`  Created ${folder}/ic_launcher_round.png (${size}x${size})`);
  }

  // Generate adaptive icon foreground
  // The foreground should have the icon centered with padding for the safe zone
  const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>
    <linearGradient id="crescentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fcd34d"/>
      <stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
  </defs>
  
  <!-- Crescent moon centered in safe zone (18-90 range = 72dp safe zone) -->
  <mask id="crescentMask">
    <rect width="108" height="108" fill="white"/>
    <circle cx="62" cy="42" r="20" fill="black"/>
  </mask>
  
  <circle cx="52" cy="40" r="22" fill="url(#crescentGradient)" mask="url(#crescentMask)"/>
  
  <!-- Simple mosque dome silhouette -->
  <path d="M30 78 
           Q30 65 44 60 
           Q54 56 64 60 
           Q78 65 78 78 
           L78 85 
           L30 85 Z" 
        fill="rgba(255,255,255,0.9)"/>
  
  <!-- Minarets -->
  <rect x="34" y="68" width="5" height="17" rx="1" fill="rgba(255,255,255,0.9)"/>
  <circle cx="36.5" cy="66" r="3" fill="rgba(255,255,255,0.9)"/>
  
  <rect x="69" y="68" width="5" height="17" rx="1" fill="rgba(255,255,255,0.9)"/>
  <circle cx="71.5" cy="66" r="3" fill="rgba(255,255,255,0.9)"/>
</svg>`;

  for (const [folder, size] of Object.entries(ADAPTIVE_SIZES)) {
    const outputPath = join(androidResPath, folder, 'ic_launcher_foreground.png');
    
    await sharp(Buffer.from(foregroundSvg))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`  Created ${folder}/ic_launcher_foreground.png (${size}x${size})`);
  }

  // Generate notification icon (white silhouette on transparent)
  const notificationSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <!-- Simple crescent for notification -->
  <mask id="notifMask">
    <rect width="24" height="24" fill="white"/>
    <circle cx="14" cy="8" r="5" fill="black"/>
  </mask>
  <circle cx="11" cy="7" r="6" fill="white" mask="url(#notifMask)"/>
  
  <!-- Small dome -->
  <path d="M6 18 Q6 14 10 13 Q12 12 14 13 Q18 14 18 18 L18 20 L6 20 Z" fill="white"/>
</svg>`;

  // Notification icons
  const NOTIFICATION_SIZES = {
    'drawable-mdpi': 24,
    'drawable-hdpi': 36,
    'drawable-xhdpi': 48,
    'drawable-xxhdpi': 72,
    'drawable-xxxhdpi': 96,
  };

  for (const [folder, size] of Object.entries(NOTIFICATION_SIZES)) {
    const folderPath = join(androidResPath, folder);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }
    
    const outputPath = join(folderPath, 'ic_stat_icon.png');
    
    await sharp(Buffer.from(notificationSvg))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`  Created ${folder}/ic_stat_icon.png (${size}x${size})`);
  }

  console.log('\nDone! Icons generated successfully.');
}

generateIcons().catch(console.error);
