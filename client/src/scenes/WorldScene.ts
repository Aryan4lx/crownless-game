import Phaser from 'phaser';
import { THEME, FACTION_COLOR } from '../theme.js';

const MAP_SIZE = 1024;

export default class WorldScene extends Phaser.Scene {
  room: any;
  myId: string = '';
  gameObjects: Map<string, any> = new Map();
  campObjects: Map<string, any> = new Map();
  nodeObjects: Map<string, any> = new Map();
  crownGlow: any = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  init() {
    this.room = this.registry.get('room');
    this.myId = this.registry.get('myId');
  }

  preload() {
    // Load all assets from /assets/
    this.load.path = 'assets/';
    this.load.image('castle-small', 'building-castle-small.png');
    this.load.image('castle-hero', 'castle-hero.png');
    this.load.image('crown-realm', 'crown-realm.svg');
    this.load.image('decor-fir', 'decor-fir.png');
    this.load.image('decor-pine', 'decor-pine.png');
    this.load.image('decor-oak', 'decor-oak.png');
    this.load.image('capital-sultan', 'capital-sultan.svg');
    this.load.image('capital-tsar', 'capital-tsar.svg');
    this.load.image('capital-king', 'capital-king.svg');
    this.load.image('capital-khan', 'capital-khan.svg');
  }

  create() {
    // Camera bounds = world size
    this.cameras.main.setBounds(0, 0, MAP_SIZE, MAP_SIZE);
    this.cameras.main.setBackgroundColor('#0a140c');

    // Dark terrain background
    this.createTerrain();

    // The Crown at center
    this.createCrown();

    // Click to move
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.handleMapClick(worldPoint.x, worldPoint.y);
    });

    // Sync state from room
    this.syncState();

    // Re-sync on every state change
    this.room?.onStateChange(() => this.syncState());
  }

  createTerrain() {
    // Dark woodland gradient base
    const g = this.add.graphics();
    g.fillGradientStyle(THEME.bgDeep, THEME.bgDeep, 0x0e1a10, 0x0a140c, 1);
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Subtle radial glows (forest areas)
    const glows = [
      { x: MAP_SIZE * 0.25, y: MAP_SIZE * 0.35, r: 300, c: 0x223c26 },
      { x: MAP_SIZE * 0.75, y: MAP_SIZE * 0.65, r: 280, c: 0x1c3420 },
      { x: MAP_SIZE * 0.50, y: MAP_SIZE * 0.50, r: 350, c: 0x142820 },
    ];
    glows.forEach(glow => {
      g.fillStyle(glow.c, 0.5);
      g.fillCircle(glow.x, glow.y, glow.r);
    });

    // Grid lines (faint)
    g.lineStyle(1, 0xffffff, 0.03);
    for (let i = 0; i <= MAP_SIZE; i += 64) {
      g.lineBetween(i, 0, i, MAP_SIZE);
      g.lineBetween(0, i, MAP_SIZE, i);
    }

    // Scatter decorative trees from sprites
    const treeTypes = ['decor-fir', 'decor-pine', 'decor-oak'];
    for (let i = 0; i < 80; i++) {
      const tx = Phaser.Math.Between(20, MAP_SIZE - 20);
      const ty = Phaser.Math.Between(20, MAP_SIZE - 20);
      // Keep center clear
      if (Math.hypot(tx - 512, ty - 512) < 80) continue;
      const type = treeTypes[Phaser.Math.Between(0, 2)];
      const scale = 0.3 + Math.random() * 0.3;
      const tree = this.add.image(tx, ty, type);
      tree.setScale(scale);
      tree.setAlpha(0.6 + Math.random() * 0.3);
      tree.setDepth(1);
    }
  }

  createCrown() {
    const cx = MAP_SIZE / 2;
    const cy = MAP_SIZE / 2;

    // Outer glow aura
    this.crownGlow = this.add.graphics();
    this.crownGlow.fillStyle(THEME.gold, 0.15);
    this.crownGlow.fillCircle(cx, cy, 90);
    this.crownGlow.fillStyle(THEME.gold, 0.08);
    this.crownGlow.fillCircle(cx, cy, 140);

    // Ring
    const ring = this.add.graphics();
    ring.lineStyle(2, THEME.gold, 0.8);
    ring.strokeCircle(cx, cy, 46);
    ring.lineStyle(6, THEME.gold, 0.25);
    ring.strokeCircle(cx, cy, 54);

    // Crown sprite
    const crown = this.add.image(cx, cy - 5, 'crown-realm');
    crown.setScale(0.15);
    crown.setDepth(20);

    // Pulsing animation
    this.tweens.add({
      targets: this.crownGlow,
      alpha: { from: 0.6, to: 1 },
      scale: { from: 0.95, to: 1.1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Label
    const label = this.add.text(cx, cy + 50, 'THE CROWN', {
      fontFamily: THEME.fonts.serif,
      fontSize: '13px',
      color: THEME.strings.gold,
      letterSpacing: 4,
    });
    label.setOrigin(0.5);
    label.setDepth(20);
  }

  handleMapClick(worldX: number, worldY: number) {
    // Check camp click
    let clickedCamp = false;
    this.room?.state?.camps?.forEach((camp: any, id: string) => {
      if (!camp.alive) return;
      if (Math.hypot(camp.x - worldX, camp.y - worldY) < 40) {
        clickedCamp = true;
        const stars = '★'.repeat(camp.tier || 1);
        const attack = window.confirm(
          `${stars} Attack ${camp.name}?\nArmy: ${camp.army} | Loot: 🪙${camp.lootGold} 🪵${camp.lootWood}\nYour army: ${this.getMyArmy()}`
        );
        if (attack) this.room.send('attack', { target: id });
      }
    });
    if (clickedCamp) return;

    // Check player click (attack)
    let clickedPlayer = false;
    this.room?.state?.players?.forEach((p: any, id: string) => {
      if (id === this.myId) return;
      if (Math.hypot(p.x - worldX, p.y - worldY) < 35) {
        clickedPlayer = true;
        const attack = window.confirm(`⚔️ Attack ${p.name}? (Your army: ${this.getMyArmy()})`);
        if (attack) this.room.send('attack', { target: id });
      }
    });
    if (clickedPlayer) return;

    // Otherwise move
    this.room?.send('move', { x: Math.round(worldX), y: Math.round(worldY) });
  }

  getMyArmy(): number {
    const me = this.room?.state?.players?.get(this.myId);
    return me?.army ?? 0;
  }

  syncState() {
    if (!this.room?.state) return;

    // Sync resource nodes
    const nodes = this.room.state.nodes;
    if (nodes) {
      nodes.forEach((node: any, id: string) => {
        if (!this.nodeObjects.has(id)) {
          const nodeColor = node.type === 'gold' ? THEME.gold : node.type === 'food' ? 0x8ab87a : 0xb89a6a;
          const circle = this.add.graphics();
          circle.fillStyle(0xffffff, 0.06);
          circle.fillCircle(node.x, node.y, 14);
          circle.fillStyle(nodeColor, 1);
          circle.fillCircle(node.x, node.y, 8);
          circle.lineStyle(1.5, nodeColor, 0.6);
          circle.strokeCircle(node.x, node.y, 8);
          circle.setDepth(3);
          this.nodeObjects.set(id, circle);
        }
      });
    }

    // Sync camps
    const camps = this.room.state.camps;
    if (camps) {
      camps.forEach((camp: any, id: string) => {
        this.syncCamp(id, camp);
      });
    }

    // Sync players
    const players = this.room.state.players;
    if (players) {
      players.forEach((player: any, id: string) => {
        this.syncPlayer(id, player);
      });
    }
  }

  syncCamp(id: string, camp: any) {
    const tierColors = [0x8a6a3e, 0xb8334a, 0x8a2a6a, 0xc02020];
    const color = tierColors[(camp.tier || 1) - 1] || tierColors[0];

    let obj = this.campObjects.get(id);
    if (!obj) {
      const container = this.add.container(camp.x, camp.y);
      container.setDepth(5);

      if (camp.alive) {
        // Tent shape
        const tent = this.add.graphics();
        const scale = 1 + ((camp.tier || 1) - 1) * 0.15;
        tent.fillStyle(color, 1);
        tent.beginPath();
        tent.moveTo(-9 * scale, 9 * scale);
        tent.lineTo(9 * scale, 9 * scale);
        tent.lineTo(0, -12 * scale);
        tent.closePath();
        tent.fillPath();
        tent.lineStyle(1.2, THEME.gold, 1);
        tent.strokePath();

        // Name + army text
        const labelText = this.add.text(0, -28, `${camp.name} ⚔️${camp.army}`, {
          fontFamily: THEME.fonts.sans,
          fontSize: '9px',
          color: camp.tier >= 4 ? THEME.strings.gold : '#e8d8c8',
          backgroundColor: 'rgba(10,10,11,0.85)',
          padding: { x: 5, y: 2 },
        });
        labelText.setOrigin(0.5);

        // Loot hint
        const lootText = this.add.text(0, 18, `🪙${camp.lootGold}`, {
          fontFamily: THEME.fonts.sans,
          fontSize: '8px',
          color: THEME.strings.gold,
        });
        lootText.setOrigin(0.5);

        // Tier stars
        const starText = this.add.text(0, 8 * scale, '★'.repeat(camp.tier || 1), {
          fontFamily: THEME.fonts.sans,
          fontSize: '8px',
          color: THEME.strings.gold,
        });
        starText.setOrigin(0.5);

        container.add([tent, labelText, starText, lootText]);
      } else {
        // Raided ruins
        const ruin = this.add.graphics();
        ruin.fillStyle(0x505050, 0.8);
        ruin.fillCircle(0, 0, 12);
        const skull = this.add.text(0, 0, '💀', { fontSize: '11px' });
        skull.setOrigin(0.5);
        const raidText = this.add.text(0, 18, 'raided', {
          fontSize: '9px',
          color: '#888',
        });
        raidText.setOrigin(0.5);
        container.add([ruin, skull, raidText]);
      }

      this.campObjects.set(id, container);
    } else {
      // Update position if camp moved (it shouldn't, but for safety)
      obj.setPosition(camp.x, camp.y);
    }
  }

  syncPlayer(id: string, player: any) {
    const isMe = id === this.myId;
    const factionColor = FACTION_COLOR[player.faction as keyof typeof FACTION_COLOR] || THEME.gold;

    let obj = this.gameObjects.get(id);
    if (!obj) {
      // Create castle as a container
      const container = this.add.container(player.x, player.y);
      container.setDepth(10);

      // Castle sprite
      const castle = this.add.image(0, 0, 'castle-small');
      castle.setScale(isMe ? 0.8 : 0.5);
      castle.setTint(factionColor);

      // Faction glow
      const glow = this.add.graphics();
      glow.fillStyle(factionColor, 0.3);
      glow.fillEllipse(0, 4, 40, 10);

      // Name plate
      const nameText = this.add.text(0, -35, player.name, {
        fontFamily: THEME.fonts.sans,
        fontSize: '10px',
        color: isMe ? '#ffffff' : '#c9c4ba',
        backgroundColor: 'rgba(10,10,11,0.85)',
        padding: { x: 7, y: 2 },
        fontStyle: isMe ? 'bold' : 'normal',
      });
      nameText.setOrigin(0.5);

      // Level badge
      const levelText = this.add.text(20, -28, `Lv${player.level || 1}`, {
        fontFamily: THEME.fonts.sans,
        fontSize: '8px',
        color: THEME.strings.gold,
        backgroundColor: 'rgba(212,166,74,0.15)',
        padding: { x: 3, y: 1 },
      });
      levelText.setOrigin(0.5);

      // Army badge
      const armyText = this.add.text(0, -50, '', {
        fontFamily: THEME.fonts.sans,
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      });
      armyText.setOrigin(0.5);

      container.add([glow, castle, nameText, levelText, armyText]);
      this.gameObjects.set(id, { container, armyText, castle, glow });

      // Follow player with camera if it's me
      if (isMe) {
        this.cameras.main.startFollow(container, true, 0.1, 0.1);
      }
    } else {
      // Update existing player position
      obj.container.setPosition(player.x, player.y);

      // Update army badge
      if (player.army > 0) {
        obj.armyText.setText(`⚔️${player.army}`);
        obj.armyText.setColor(player.army >= 50 ? '#f04040' : '#ffffff');
      } else {
        obj.armyText.setText('');
      }
    }
  }

  update() {
    // Smooth interpolation would go here for movement prediction
  }
}
