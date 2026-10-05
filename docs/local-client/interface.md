# Interface Mode Client

## Navigation

Le mode client propose une navigation simplifiée par rapport au mode serveur.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NAVIGATION MODE CLIENT                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  🏠 Tableau de bord                                                │     │
│  │  📊 Consommation                                                   │     │
│  │     ├─ kWh                                                         │     │
│  │     └─ Euro                                                        │     │
│  │  ⚡ Production                                                     │     │
│  │  📈 Bilan                                                          │     │
│  │  🎁 Contribuer                                                     │     │
│  │  🔴 Tempo                                                          │     │
│  │  🟢 EcoWatt                                                        │     │
│  │  ───────────────────                                               │     │
│  │  📤 Exporter                   ← NOUVEAU                           │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  Pages SUPPRIMÉES (vs mode serveur) :                                       │
│  ✗ Page d'accueil (landing)                                                 │
│  ✗ Inscription / Connexion                                                  │
│  ✗ Administration                                                           │
│  ✗ Simulateur                                                               │
│  ✗ FAQ                                                                      │
│  ✗ Paramètres avancés                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Différences par page

### Tableau de bord

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Source PDL | Base locale + Enedis | API MyElectricalData |
| Bouton sync | Actualiser cache | Synchroniser depuis API |
| Statut consent | Affiché | Masqué (géré côté serveur) |
| Actions PDL | CRUD complet | Lecture seule |

**Mode client** : Affiche uniquement les PDL autorisés sur le compte MyElectricalData distant.

```tsx
// Dashboard mode client
<Dashboard>
  <Header>
    <h1>Tableau de bord</h1>
    <SyncButton onClick={syncFromApi}>
      🔄 Synchroniser
    </SyncButton>
  </Header>

  <LastSyncInfo>
    Dernière synchronisation : {lastSync}
  </LastSyncInfo>

  <PDLGrid>
    {pdls.map(pdl => (
      <PDLCard key={pdl.id} pdl={pdl} readOnly />
    ))}
  </PDLGrid>
</Dashboard>
```

### Consommation (kWh)

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Source données | Cache Valkey (24h) | PostgreSQL local (indéfini) |
| Historique | Limité par cache | Complet depuis 1ère sync |
| Performance | Requête Enedis si miss | Toujours local |

**Mode client** : Les données sont persistées indéfiniment. Pas de rechargement depuis Enedis.

### Consommation (Euro)

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Calcul prix | Temps réel | Temps réel |
| Offres | Scraping + admin | Configuration locale |
| Historique | Selon cache | Complet |

**Mode client** : Les offres tarifaires sont configurées localement ou récupérées depuis l'API.

### Production

Comportement identique à la consommation, avec stockage local indéfini.

### Bilan

Synthèse calculée à partir des données locales PostgreSQL.

### Contribuer

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Destination | Base locale | API MyElectricalData distante |
| Validation | Immédiate | Après envoi à l'API |

**Mode client** : Les contributions sont envoyées vers l'API centrale pour bénéficier à la communauté.

### Tempo

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Source | API RTE directe | API MyElectricalData |
| Stockage | Cache Valkey | PostgreSQL local |
| Historique | J-1 à J+1 | Complet (années précédentes) |

### EcoWatt

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| Source | API RTE directe | API MyElectricalData |
| Stockage | Cache Valkey | PostgreSQL local |
| Alertes | Temps réel | Selon sync |

### Exporter (NOUVEAU)

Page exclusive au mode client pour configurer les destinations d'export.

Voir [documentation détaillée](./exporters.md).

---

## Composants modifiés

### Header

```tsx
// Mode serveur
<Header>
  <Logo />
  <Navigation />
  <UserMenu>
    <Avatar />
    <Dropdown>
      <MenuItem>Profil</MenuItem>
      <MenuItem>Paramètres</MenuItem>
      <MenuItem>Déconnexion</MenuItem>
    </Dropdown>
  </UserMenu>
</Header>

// Mode client (simplifié)
<Header>
  <Logo />
  <Navigation />
  <SyncStatus>
    Dernière sync: {lastSync}
  </SyncStatus>
</Header>
```

### Sidebar

```tsx
// Mode client - menu réduit
const clientMenuItems = [
  { path: '/dashboard', icon: Home, label: 'Tableau de bord' },
  { path: '/consumption', icon: Zap, label: 'Consommation', submenu: [
    { path: '/consumption', label: 'kWh' },
    { path: '/consumption/euro', label: 'Euro' },
  ]},
  { path: '/production', icon: Sun, label: 'Production' },
  { path: '/bilan', icon: BarChart, label: 'Bilan' },
  { path: '/contribute', icon: Gift, label: 'Contribuer' },
  { path: '/tempo', icon: Palette, label: 'Tempo' },
  { path: '/ecowatt', icon: Leaf, label: 'EcoWatt' },
  { type: 'separator' },
  { path: '/export', icon: Upload, label: 'Exporter' },  // NOUVEAU
];
```

### PDLCard

```tsx
// Mode client - lecture seule
<PDLCard readOnly>
  <PDLHeader>
    <PDLName>{pdl.name}</PDLName>
    <PDLId>{pdl.usage_point_id}</PDLId>
  </PDLHeader>

  <PDLStats>
    <Stat label="Consommation" value={consumption} />
    <Stat label="Production" value={production} />
  </PDLStats>

  {/* Pas de boutons d'édition/suppression */}
</PDLCard>
```

---

## Routes

### Définition

```typescript
// apps/web/src/routes/client.tsx

import { createBrowserRouter, Navigate } from 'react-router-dom';

export const clientRouter = createBrowserRouter([
  {
    path: '/',
    element: <ClientLayout />,
    children: [
      // Redirection racine → dashboard
      { index: true, element: <Navigate to="/dashboard" replace /> },

      // Pages principales
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'consumption', element: <ConsumptionKwh /> },
      { path: 'consumption/euro', element: <ConsumptionEuro /> },
      { path: 'production', element: <Production /> },
      { path: 'bilan', element: <Bilan /> },
      { path: 'contribute', element: <Contribute /> },
      { path: 'tempo', element: <Tempo /> },
      { path: 'ecowatt', element: <Ecowatt /> },
      { path: 'export', element: <Export /> },

      // Catch-all → dashboard
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
```

### Comparaison

```
MODE SERVEUR                    MODE CLIENT
────────────────────────        ────────────────────────
/                               / → /dashboard (redirect)
/signup                         ✗
/login                          ✗
/oauth/callback                 ✗
/dashboard                      /dashboard
/consumption                    /consumption
/consumption/euro               /consumption/euro
/production                     /production
/bilan                          /bilan
/contribute                     /contribute
/tempo                          /tempo
/ecowatt                        /ecowatt
/simulator                      ✗
/faq                            ✗
/settings                       ✗
                                /preferences ← période d'analyse
/admin/*                        ✗
                                /export ← NOUVEAU
```

---

## État global (Zustand)

### Mode serveur

```typescript
// authStore - authentification complète
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

### Mode client

```typescript
// syncStore - état de synchronisation
interface SyncState {
  lastSync: Date | null;
  isSyncing: boolean;
  syncProgress: number;
  syncError: string | null;
  sync: () => Promise<void>;
}

// exportStore - configuration exports
interface ExportState {
  configs: ExportConfig[];
  logs: ExportLog[];
  loadConfigs: () => Promise<void>;
  saveConfig: (config: ExportConfig) => Promise<void>;
  testConnection: (type: string) => Promise<boolean>;
  runExport: (type: string) => Promise<void>;
}
```

---

## Responsive

Le mode client conserve le même comportement responsive que le mode serveur :

| Breakpoint | Sidebar | Layout |
|------------|---------|--------|
| < 768px | Masquée (hamburger) | Mobile |
| 768px - 1024px | Icônes seules | Tablet |
| > 1024px | Complète | Desktop |

---

## Theme

Le mode client supporte le dark mode avec les mêmes variables CSS.

```css
/* Identique au mode serveur */
:root {
  --primary-600: #0284c7;
  --gray-800: #1f2937;
  /* ... */
}

.dark {
  --primary-600: #38bdf8;
  --gray-800: #f3f4f6;
  /* ... */
}
```

---

## Build conditionnel

Le frontend peut être buildé en mode client ou serveur :

```bash
# Build mode client (défaut)
npm run build

# Build mode serveur
VITE_SERVER_MODE=true npm run build
```

Le tree-shaking supprime automatiquement les composants non utilisés (admin, auth, etc.).
