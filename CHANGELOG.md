# Changelog

## [1.18.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.18.1...1.18.2) (2026-02-05)

### Refactoring

* supprimer l'offre UFC de la configuration des sidebars ([48c677e](https://github.com/MyElectricalData/myelectricaldata_new/commit/48c677e54106e10104ba13c150550859fe5bb44f))

## [1.18.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.18.0...1.18.1) (2026-02-05)

### Refactoring

* Simulator component: rename showOnlyRecent to showOldOffers and update related logic; enhance container runtime detection in scripts; remove UFC Que Choisir documentation; update README for offers; improve frontend and backend watch scripts for container compatibility. ([ebd8f7e](https://github.com/MyElectricalData/myelectricaldata_new/commit/ebd8f7e47128555fc961a6dea0a5f9de9b62adfd))

## [1.18.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.17.0...1.18.0) (2026-02-02)

### Features

* ajouter des champs pour la source de données et la date d'extraction dans le JSON des offres ([02aa60f](https://github.com/MyElectricalData/myelectricaldata_new/commit/02aa60fb0a97441dadba8d05a1cc54a20a7f2f85))

## [1.17.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.16.0...1.17.0) (2026-02-02)

### Features

* améliorer la gestion des plages de dates pour les profils dans le simulateur ([1922ec6](https://github.com/MyElectricalData/myelectricaldata_new/commit/1922ec62eb117e1f22cfb9bde427847bd182b370))

## [1.16.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.15.0...1.16.0) (2026-02-02)

### Features

* add valid_from date handling in contributions and offers ([473c812](https://github.com/MyElectricalData/myelectricaldata_new/commit/473c812adcc4cad47c941309c34c0533f8bded4f))

## [1.15.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.14.0...1.15.0) (2026-02-02)

### Features

* améliorer la logique de suppression des offres avec plusieurs méthodes de recherche ([4405e22](https://github.com/MyElectricalData/myelectricaldata_new/commit/4405e222147d65a447b04e7846a0d06e85c57c6b))

## [1.14.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.13.0...1.14.0) (2026-02-02)

### Features

* add AI mode for JSON import of offers ([5d1875c](https://github.com/MyElectricalData/myelectricaldata_new/commit/5d1875c63aae93e9298ab70e42080b86fe1ce358))

### Bug Fixes

* **contribute:** corriger les erreurs de build CI du mode IA ([0763519](https://github.com/MyElectricalData/myelectricaldata_new/commit/0763519dea06ff31cc9b973cfa429815c7aa909f))

## [1.13.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.12.0...1.13.0) (2026-02-01)

### Features

* ajouter une modale de confirmation pour éviter la perte de modifications non soumises ([1531d93](https://github.com/MyElectricalData/myelectricaldata_new/commit/1531d9390cd3c45153ee9c6074a2f7864df2fbc4))

## [1.12.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.11.0...1.12.0) (2026-02-01)

### Features

* ajouter un sélecteur de période avec intégration des préférences utilisateur dans le simulateur ([ffd725d](https://github.com/MyElectricalData/myelectricaldata_new/commit/ffd725d6fef89ea8d125cc3f19e9fc1bec0d10ba))

## [1.11.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.10.0...1.11.0) (2026-02-01)

### Features

* add SingleDatePicker component and integrate date management in contribution forms ([fd287f9](https://github.com/MyElectricalData/myelectricaldata_new/commit/fd287f977da294513ba285511c440462383b19a2))
* **web:** ameliorer le simulateur avec selecteur de periode et UX ([ebbd1f1](https://github.com/MyElectricalData/myelectricaldata_new/commit/ebbd1f14e3299c55637b88ed970d5b6297e9cc91))

### Bug Fixes

* correct typo in comments for existing secrets configuration ([57341bd](https://github.com/MyElectricalData/myelectricaldata_new/commit/57341bdfff1b3df97e8236ac55d4f1e98f78a363))
* **web:** retirer les imports Calendar inutilises qui cassent le build ([7176945](https://github.com/MyElectricalData/myelectricaldata_new/commit/71769459f402a882bfdf76b1fc222cb09fce8cd4))

## [1.10.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.9.1...1.10.0) (2026-01-29)

### Features

* Update various pages and components for improved functionality and user experience ([ea84072](https://github.com/MyElectricalData/myelectricaldata_new/commit/ea840720d0d0a7effd6f1c5de668a7167e5088f9))

## [1.9.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.9.0...1.9.1) (2026-01-28)

### Refactoring

* update button styles from gradient to primary and adjust export button widths across multiple components ([3756638](https://github.com/MyElectricalData/myelectricaldata_new/commit/375663880e2faad88a6687645cc4a8eb0217af90))

## [1.9.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.8.0...1.9.0) (2026-01-26)

### Features

* Add backend and frontend Helm chart templates with configuration ([b6d263a](https://github.com/MyElectricalData/myelectricaldata_new/commit/b6d263a9c544d41434e2653bb1ab03198e998ce0))
* add consumption euro page with detailed features and implementation ([2902470](https://github.com/MyElectricalData/myelectricaldata_new/commit/290247055268633bbfdf438c4c7399dad8be0ad8))
* Add new pricing calculators for various offers ([72e47ad](https://github.com/MyElectricalData/myelectricaldata_new/commit/72e47ad284218550f18c29c37ed997d2dc12831a))
* mettre à jour le package valkey à la version 0.13.0 ([2bcfe80](https://github.com/MyElectricalData/myelectricaldata_new/commit/2bcfe80e4a641680a9665857c361028360bdcb65))
* mise à jour de la version du chart et ajout de la variable d'environnement SERVER_MODE pour le déploiement ([829025e](https://github.com/MyElectricalData/myelectricaldata_new/commit/829025e4ea32fbc3544e8e852747672d199b8abb))
* mise à jour des configurations mypy et ESLint, amélioration de la gestion des erreurs de token et refactorisation des appels d'API ([431145e](https://github.com/MyElectricalData/myelectricaldata_new/commit/431145e5e05362228ce747df8f214a1bcfc0262c))
* mise à jour des fichiers de configuration et des instructions Docker pour le mode client ([9dd2bc7](https://github.com/MyElectricalData/myelectricaldata_new/commit/9dd2bc7f39846affc20e6b8895d08403a90d4c16))
* refactor global environment declaration for runtime configuration in vite-env.d.ts ([2cb1870](https://github.com/MyElectricalData/myelectricaldata_new/commit/2cb1870b39d40078ef347aa49645d69c5fe00657))
* **web:** support runtime VITE_SERVER_MODE via env.js ([811ec6b](https://github.com/MyElectricalData/myelectricaldata_new/commit/811ec6b6537a5bc33a354b6bb076ca87797d52d1))

## [1.9.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.8.0...1.9.0-dev.1) (2026-01-26)

### Features

* Add backend and frontend Helm chart templates with configuration ([b6d263a](https://github.com/MyElectricalData/myelectricaldata_new/commit/b6d263a9c544d41434e2653bb1ab03198e998ce0))
* add consumption euro page with detailed features and implementation ([2902470](https://github.com/MyElectricalData/myelectricaldata_new/commit/290247055268633bbfdf438c4c7399dad8be0ad8))
* Add new pricing calculators for various offers ([72e47ad](https://github.com/MyElectricalData/myelectricaldata_new/commit/72e47ad284218550f18c29c37ed997d2dc12831a))
* mettre à jour le package valkey à la version 0.13.0 ([2bcfe80](https://github.com/MyElectricalData/myelectricaldata_new/commit/2bcfe80e4a641680a9665857c361028360bdcb65))
* mise à jour des configurations mypy et ESLint, amélioration de la gestion des erreurs de token et refactorisation des appels d'API ([431145e](https://github.com/MyElectricalData/myelectricaldata_new/commit/431145e5e05362228ce747df8f214a1bcfc0262c))
* mise à jour des fichiers de configuration et des instructions Docker pour le mode client ([9dd2bc7](https://github.com/MyElectricalData/myelectricaldata_new/commit/9dd2bc7f39846affc20e6b8895d08403a90d4c16))

## [1.8.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.7.0...1.8.0) (2026-01-11)

### Features

* **simulator:** amelioration export PDF et offre de reference ([b872ed0](https://github.com/MyElectricalData/myelectricaldata_new/commit/b872ed02ce0dce0997ad7694110b430b411b02a0))

### Bug Fixes

* add missing useAllPdls hook ([85e31d6](https://github.com/MyElectricalData/myelectricaldata_new/commit/85e31d6f62b045224776c0a9cc928817ecd88c33))

## [1.8.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.7.0...1.8.0-dev.1) (2026-01-10)

### Features

* **simulator:** amelioration export PDF et offre de reference ([b872ed0](https://github.com/MyElectricalData/myelectricaldata_new/commit/b872ed02ce0dce0997ad7694110b430b411b02a0))

### Bug Fixes

* add missing useAllPdls hook ([85e31d6](https://github.com/MyElectricalData/myelectricaldata_new/commit/85e31d6f62b045224776c0a9cc928817ecd88c33))

## [1.7.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.6.0...1.7.0) (2026-01-02)

### Features

* **simulator:** highlight current offer and calculate gap relative to it ([4fc8569](https://github.com/MyElectricalData/myelectricaldata_new/commit/4fc856913e0a7fb470bdea47291b305e36fea617))

## [1.7.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.6.0...1.7.0-dev.1) (2026-01-02)

### Features

* **simulator:** highlight current offer and calculate gap relative to it ([4fc8569](https://github.com/MyElectricalData/myelectricaldata_new/commit/4fc856913e0a7fb470bdea47291b305e36fea617))

## [1.6.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.5.0...1.6.0) (2025-12-22)

### Features

* **roles:** add persistent default roles and CRUD operations ([9c56c38](https://github.com/MyElectricalData/myelectricaldata_new/commit/9c56c386701450451e4af7a353ffc7477511ac9e))
* **ui:** display frontend and backend versions in admin menu ([350971d](https://github.com/MyElectricalData/myelectricaldata_new/commit/350971d06ecff945a281ad1c53078ae25357ff6b))
* **web:** unify notification system with custom Zustand toast ([71825f0](https://github.com/MyElectricalData/myelectricaldata_new/commit/71825f044400304767046d41382a73895e8e2ac3))

### Bug Fixes

* **api:** add type annotation to fix mypy error in version.py ([c09d769](https://github.com/MyElectricalData/myelectricaldata_new/commit/c09d7699e34d8a391d09e6ae222d5f1dbb15b01e))

## [1.6.0-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.6.0-dev.1...1.6.0-dev.2) (2025-12-22)

### Features

* **ui:** display frontend and backend versions in admin menu ([350971d](https://github.com/MyElectricalData/myelectricaldata_new/commit/350971d06ecff945a281ad1c53078ae25357ff6b))

### Bug Fixes

* **api:** add type annotation to fix mypy error in version.py ([c09d769](https://github.com/MyElectricalData/myelectricaldata_new/commit/c09d7699e34d8a391d09e6ae222d5f1dbb15b01e))

## [1.6.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.5.0...1.6.0-dev.1) (2025-12-21)

### Features

* **roles:** add persistent default roles and CRUD operations ([9c56c38](https://github.com/MyElectricalData/myelectricaldata_new/commit/9c56c386701450451e4af7a353ffc7477511ac9e))
* **web:** unify notification system with custom Zustand toast ([71825f0](https://github.com/MyElectricalData/myelectricaldata_new/commit/71825f044400304767046d41382a73895e8e2ac3))

## [1.5.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.1...1.5.0) (2025-12-21)

### Features

* **helm:** add Slack notification configuration ([e1570ad](https://github.com/MyElectricalData/myelectricaldata_new/commit/e1570ad296c8472a492fa1fc389948ddb306bde7))

### Bug Fixes

* **api:** disable redirect_slashes to fix Vite proxy routing ([7fbb6e0](https://github.com/MyElectricalData/myelectricaldata_new/commit/7fbb6e07812af81d3874385c0b03f60b69431df3))
* **auth:** preserve query params in OAuth callback redirect ([c0b51c0](https://github.com/MyElectricalData/myelectricaldata_new/commit/c0b51c02a6e083c141afde7fad00e3f72d899fb5))

## [1.5.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.1...1.5.0-dev.1) (2025-12-21)

### Features

* **helm:** add Slack notification configuration ([e1570ad](https://github.com/MyElectricalData/myelectricaldata_new/commit/e1570ad296c8472a492fa1fc389948ddb306bde7))

### Bug Fixes

* **api:** disable redirect_slashes to fix Vite proxy routing ([7fbb6e0](https://github.com/MyElectricalData/myelectricaldata_new/commit/7fbb6e07812af81d3874385c0b03f60b69431df3))
* **auth:** preserve query params in OAuth callback redirect ([c0b51c0](https://github.com/MyElectricalData/myelectricaldata_new/commit/c0b51c02a6e083c141afde7fad00e3f72d899fb5))

## [1.4.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.0...1.4.1) (2025-12-21)

### Bug Fixes

* address Copilot code review feedback ([57f4da5](https://github.com/MyElectricalData/myelectricaldata_new/commit/57f4da598a23030b236fe9b0e18fcfd57031c183))
* **auth:** resolve login bootloop after httpOnly cookie migration ([eb6eff7](https://github.com/MyElectricalData/myelectricaldata_new/commit/eb6eff72c431bea97fcca0fa6a443023b1de44b5))
* normalize API base URL to prevent double slashes ([1edeb1d](https://github.com/MyElectricalData/myelectricaldata_new/commit/1edeb1d0ddac287242348d542c16dc7c50f7e954))

## [1.4.1-dev.3](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.1-dev.2...1.4.1-dev.3) (2025-12-21)

### Bug Fixes

* normalize API base URL to prevent double slashes ([1edeb1d](https://github.com/MyElectricalData/myelectricaldata_new/commit/1edeb1d0ddac287242348d542c16dc7c50f7e954))

## [1.4.1-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.1-dev.1...1.4.1-dev.2) (2025-12-21)

### Bug Fixes

* address Copilot code review feedback ([57f4da5](https://github.com/MyElectricalData/myelectricaldata_new/commit/57f4da598a23030b236fe9b0e18fcfd57031c183))

## [1.4.1-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.0...1.4.1-dev.1) (2025-12-21)

### Bug Fixes

* **auth:** resolve login bootloop after httpOnly cookie migration ([eb6eff7](https://github.com/MyElectricalData/myelectricaldata_new/commit/eb6eff72c431bea97fcca0fa6a443023b1de44b5))

## [1.4.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.3.0...1.4.0) (2025-12-20)

### Features

* add admin data sharing for PDL debugging ([cfb32b8](https://github.com/MyElectricalData/myelectricaldata_new/commit/cfb32b83ddb435c9c792aec031ead2ad2ae054ab))

### Bug Fixes

* address Copilot review suggestions ([f78115a](https://github.com/MyElectricalData/myelectricaldata_new/commit/f78115a8dbed44f5a03fd410f8be5da01b2554db))
* **api:** correct type annotation for cached_data in admin router ([9b383f1](https://github.com/MyElectricalData/myelectricaldata_new/commit/9b383f13dade4ea6332254165e075837c17fd26b))

## [1.4.0-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.4.0-dev.1...1.4.0-dev.2) (2025-12-20)

### Bug Fixes

* address Copilot review suggestions ([f78115a](https://github.com/MyElectricalData/myelectricaldata_new/commit/f78115a8dbed44f5a03fd410f8be5da01b2554db))

## [1.4.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.3.0...1.4.0-dev.1) (2025-12-20)

### Features

* add admin data sharing for PDL debugging ([cfb32b8](https://github.com/MyElectricalData/myelectricaldata_new/commit/cfb32b83ddb435c9c792aec031ead2ad2ae054ab))

### Bug Fixes

* **api:** correct type annotation for cached_data in admin router ([9b383f1](https://github.com/MyElectricalData/myelectricaldata_new/commit/9b383f13dade4ea6332254165e075837c17fd26b))

## [1.3.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.2.0...1.3.0) (2025-12-20)

### Features

* **api:** add Slack notifications for new contributions ([4a87243](https://github.com/MyElectricalData/myelectricaldata_new/commit/4a872435d5c019122ed32d9df031583af17d7300))
* **simulator:** add PDF export per offer and calculation explanations ([bdfa4aa](https://github.com/MyElectricalData/myelectricaldata_new/commit/bdfa4aa5ba3a2400af4fc083b4cc38b74c0032dc))
* **workflow:** update sync process to trigger on successful Release workflow ([a2d039b](https://github.com/MyElectricalData/myelectricaldata_new/commit/a2d039b3d552655959c0b7a0ff68a4ad92779b26))

### Bug Fixes

* **api:** fix type annotations in SlackService ([bb055e9](https://github.com/MyElectricalData/myelectricaldata_new/commit/bb055e9296a3426c68a0bbd2dbff0e4383209141))
* **ci:** move sync-develop into Release workflow ([74e3240](https://github.com/MyElectricalData/myelectricaldata_new/commit/74e3240fdd84e4cb5b4bc10894396784408c1800))
* **web:** resolve race condition in OfferSelector initial load ([d1fe1db](https://github.com/MyElectricalData/myelectricaldata_new/commit/d1fe1db96fcd460589f4459706bee0c28c042370))

### Refactoring

* **web:** consolidate info blocks in Simulator page ([1c4d5d5](https://github.com/MyElectricalData/myelectricaldata_new/commit/1c4d5d59e5750ce1279300274811c5f664e93ac0))

## [1.3.0-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.3.0-dev.1...1.3.0-dev.2) (2025-12-20)

### Bug Fixes

* **ci:** move sync-develop into Release workflow ([74e3240](https://github.com/MyElectricalData/myelectricaldata_new/commit/74e3240fdd84e4cb5b4bc10894396784408c1800))
* **web:** resolve race condition in OfferSelector initial load ([d1fe1db](https://github.com/MyElectricalData/myelectricaldata_new/commit/d1fe1db96fcd460589f4459706bee0c28c042370))

## [1.3.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.2.0...1.3.0-dev.1) (2025-12-20)

### Features

* **api:** add Slack notifications for new contributions ([4a87243](https://github.com/MyElectricalData/myelectricaldata_new/commit/4a872435d5c019122ed32d9df031583af17d7300))
* **simulator:** add PDF export per offer and calculation explanations ([bdfa4aa](https://github.com/MyElectricalData/myelectricaldata_new/commit/bdfa4aa5ba3a2400af4fc083b4cc38b74c0032dc))
* **workflow:** update sync process to trigger on successful Release workflow ([a2d039b](https://github.com/MyElectricalData/myelectricaldata_new/commit/a2d039b3d552655959c0b7a0ff68a4ad92779b26))

### Bug Fixes

* **api:** fix type annotations in SlackService ([bb055e9](https://github.com/MyElectricalData/myelectricaldata_new/commit/bb055e9296a3426c68a0bbd2dbff0e4383209141))

### Refactoring

* **web:** consolidate info blocks in Simulator page ([1c4d5d5](https://github.com/MyElectricalData/myelectricaldata_new/commit/1c4d5d59e5750ce1279300274811c5f664e93ac0))

## [1.2.1-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.2.0...1.2.1-dev.1) (2025-12-20)

### Features

* **api:** add Slack notifications for new contributions ([4a87243](https://github.com/MyElectricalData/myelectricaldata_new/commit/4a872435d5c019122ed32d9df031583af17d7300))
* **simulator:** add PDF export per offer and calculation explanations ([bdfa4aa](https://github.com/MyElectricalData/myelectricaldata_new/commit/bdfa4aa5ba3a2400af4fc083b4cc38b74c0032dc))
* **workflow:** update sync process to trigger on successful Release workflow ([a2d039b](https://github.com/MyElectricalData/myelectricaldata_new/commit/a2d039b3d552655959c0b7a0ff68a4ad92779b26))

### Bug Fixes

* **api:** fix type annotations in SlackService ([bb055e9](https://github.com/MyElectricalData/myelectricaldata_new/commit/bb055e9296a3426c68a0bbd2dbff0e4383209141))

### Refactoring

* **web:** consolidate info blocks in Simulator page ([1c4d5d5](https://github.com/MyElectricalData/myelectricaldata_new/commit/1c4d5d59e5750ce1279300274811c5f664e93ac0))

## [1.2.0](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0...1.2.0) (2025-12-20)

### Features

* **ci:** add pre-commit hooks for linting ([c1614a9](https://github.com/MyElectricalData/myelectricaldata_new/commit/c1614a9e813a62328ed20eea777ea47b62843f45))
* **ci:** separate CI/CD pipelines for apps and Helm chart ([6480760](https://github.com/MyElectricalData/myelectricaldata_new/commit/64807609ad5f7dc2c8c14701e569d67e6fe6573d))
* **helm:** migrate from Redis to Valkey ([5dd2ada](https://github.com/MyElectricalData/myelectricaldata_new/commit/5dd2adae748dd4a7e5fa6d2185162c7734823704))
* **web:** add JSON download button for API credentials ([ed5bc85](https://github.com/MyElectricalData/myelectricaldata_new/commit/ed5bc85d70b080793dd3c9ea0a09f8eed9765a3d))
* **web:** mask client_secret and update warning message ([8824238](https://github.com/MyElectricalData/myelectricaldata_new/commit/8824238120167c9fd5ec17cc9a423e70f3e8f652))

### Bug Fixes

* **api:** remove unused imports ([6da4bf0](https://github.com/MyElectricalData/myelectricaldata_new/commit/6da4bf0955de2b360fea0cb3f660b74cf25c0df0))
* **api:** resolve all 204 mypy type errors ([3e45d5b](https://github.com/MyElectricalData/myelectricaldata_new/commit/3e45d5b8e38c663216ddcc69dacad6035a7f1d20))
* **api:** resolve all ruff linting errors ([d3366b3](https://github.com/MyElectricalData/myelectricaldata_new/commit/d3366b38bf1ece18179c9ad1c8ccdfa9899abde6))
* **ci:** add extra_plugins for semantic-release action ([5a1561f](https://github.com/MyElectricalData/myelectricaldata_new/commit/5a1561f2e7fc4e2b1e576fd3163a44cccb716ba4))
* **ci:** add mypy to dependency-groups for CI type checking ([717f99d](https://github.com/MyElectricalData/myelectricaldata_new/commit/717f99d1aaf1634780d5c8d80b1c8cbefcec9984))
* **ci:** disable ARM64 build by default to speed up CI ([3b3e6cb](https://github.com/MyElectricalData/myelectricaldata_new/commit/3b3e6cbc327074f432614651ea1220c0655a54b1))
* **ci:** remove 'v' prefix from helm tags ([8f2557e](https://github.com/MyElectricalData/myelectricaldata_new/commit/8f2557e4d2816f668e4c24211d61e2d9ca73e73c))
* **ci:** trigger release only on apps changes ([dfd98af](https://github.com/MyElectricalData/myelectricaldata_new/commit/dfd98afaba9f3602e7827b84a52b392003852f7b))
* **ci:** use config swap instead of extends for helm release ([9eee893](https://github.com/MyElectricalData/myelectricaldata_new/commit/9eee893fce951e853915f204810f045796a46467))
* **ci:** use helm/vX.X.X tags without GitHub releases ([9ab83ed](https://github.com/MyElectricalData/myelectricaldata_new/commit/9ab83eda8a0da3dcfd0d12a6af94b51f9ddab510))
* **ci:** use semantic-release action for proper GitHub outputs ([4c5ead6](https://github.com/MyElectricalData/myelectricaldata_new/commit/4c5ead6f34f38f9ade6530a6e6d05e420c31b70d))
* **helm:** correct postgres/valkey condition and configmap references ([61087da](https://github.com/MyElectricalData/myelectricaldata_new/commit/61087daf59425a7fe0d7ef7f928c6dc98cadc5b7))
* **valkey:** update existingSecretKey to existingSecretPasswordKey in values.yaml and helpers.tpl ([9597eb4](https://github.com/MyElectricalData/myelectricaldata_new/commit/9597eb4e65947f6a18e6bdeb95f85b78126204cd))
* **web:** add defensive type checks for offpeak_hours parsing ([a82441f](https://github.com/MyElectricalData/myelectricaldata_new/commit/a82441f5b5374bef197302cf16df4bbd3485f74d))
* **web:** handle nested arrays in offpeak_hours parsing ([609661b](https://github.com/MyElectricalData/myelectricaldata_new/commit/609661bdcd45913e37224b238264181a68594caf))
* **web:** make login button full width on signup success ([07786f8](https://github.com/MyElectricalData/myelectricaldata_new/commit/07786f87493d7a508558fe529621f37cf45cdb5b))
* **web:** sync OfferSelector state on page navigation ([2ec0cf1](https://github.com/MyElectricalData/myelectricaldata_new/commit/2ec0cf13ec462efa2e57a75d9f871a87f9d13ff0))

## [1.2.0-dev.3](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.2.0-dev.2...1.2.0-dev.3) (2025-12-20)

### Bug Fixes

* **ci:** disable ARM64 build by default to speed up CI ([3b3e6cb](https://github.com/MyElectricalData/myelectricaldata_new/commit/3b3e6cbc327074f432614651ea1220c0655a54b1))
* **web:** add defensive type checks for offpeak_hours parsing ([a82441f](https://github.com/MyElectricalData/myelectricaldata_new/commit/a82441f5b5374bef197302cf16df4bbd3485f74d))

## [1.2.0-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.2.0-dev.1...1.2.0-dev.2) (2025-12-19)

### Features

* **web:** mask client_secret and update warning message ([8824238](https://github.com/MyElectricalData/myelectricaldata_new/commit/8824238120167c9fd5ec17cc9a423e70f3e8f652))

## [1.2.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0...1.2.0-dev.1) (2025-12-19)

### Features

* **ci:** add pre-commit hooks for linting ([c1614a9](https://github.com/MyElectricalData/myelectricaldata_new/commit/c1614a9e813a62328ed20eea777ea47b62843f45))
* **ci:** separate CI/CD pipelines for apps and Helm chart ([6480760](https://github.com/MyElectricalData/myelectricaldata_new/commit/64807609ad5f7dc2c8c14701e569d67e6fe6573d))
* **helm:** migrate from Redis to Valkey ([5dd2ada](https://github.com/MyElectricalData/myelectricaldata_new/commit/5dd2adae748dd4a7e5fa6d2185162c7734823704))
* **web:** add JSON download button for API credentials ([ed5bc85](https://github.com/MyElectricalData/myelectricaldata_new/commit/ed5bc85d70b080793dd3c9ea0a09f8eed9765a3d))

### Bug Fixes

* **api:** remove unused imports ([6da4bf0](https://github.com/MyElectricalData/myelectricaldata_new/commit/6da4bf0955de2b360fea0cb3f660b74cf25c0df0))
* **api:** resolve all 204 mypy type errors ([3e45d5b](https://github.com/MyElectricalData/myelectricaldata_new/commit/3e45d5b8e38c663216ddcc69dacad6035a7f1d20))
* **api:** resolve all ruff linting errors ([d3366b3](https://github.com/MyElectricalData/myelectricaldata_new/commit/d3366b38bf1ece18179c9ad1c8ccdfa9899abde6))
* **ci:** add extra_plugins for semantic-release action ([5a1561f](https://github.com/MyElectricalData/myelectricaldata_new/commit/5a1561f2e7fc4e2b1e576fd3163a44cccb716ba4))
* **ci:** add mypy to dependency-groups for CI type checking ([717f99d](https://github.com/MyElectricalData/myelectricaldata_new/commit/717f99d1aaf1634780d5c8d80b1c8cbefcec9984))
* **ci:** remove 'v' prefix from helm tags ([8f2557e](https://github.com/MyElectricalData/myelectricaldata_new/commit/8f2557e4d2816f668e4c24211d61e2d9ca73e73c))
* **ci:** trigger release only on apps changes ([dfd98af](https://github.com/MyElectricalData/myelectricaldata_new/commit/dfd98afaba9f3602e7827b84a52b392003852f7b))
* **ci:** use config swap instead of extends for helm release ([9eee893](https://github.com/MyElectricalData/myelectricaldata_new/commit/9eee893fce951e853915f204810f045796a46467))
* **ci:** use helm/vX.X.X tags without GitHub releases ([9ab83ed](https://github.com/MyElectricalData/myelectricaldata_new/commit/9ab83eda8a0da3dcfd0d12a6af94b51f9ddab510))
* **ci:** use semantic-release action for proper GitHub outputs ([4c5ead6](https://github.com/MyElectricalData/myelectricaldata_new/commit/4c5ead6f34f38f9ade6530a6e6d05e420c31b70d))
* **helm:** correct postgres/valkey condition and configmap references ([61087da](https://github.com/MyElectricalData/myelectricaldata_new/commit/61087daf59425a7fe0d7ef7f928c6dc98cadc5b7))
* **valkey:** update existingSecretKey to existingSecretPasswordKey in values.yaml and helpers.tpl ([9597eb4](https://github.com/MyElectricalData/myelectricaldata_new/commit/9597eb4e65947f6a18e6bdeb95f85b78126204cd))
* **web:** handle nested arrays in offpeak_hours parsing ([609661b](https://github.com/MyElectricalData/myelectricaldata_new/commit/609661bdcd45913e37224b238264181a68594caf))
* **web:** make login button full width on signup success ([07786f8](https://github.com/MyElectricalData/myelectricaldata_new/commit/07786f87493d7a508558fe529621f37cf45cdb5b))
* **web:** sync OfferSelector state on page navigation ([2ec0cf1](https://github.com/MyElectricalData/myelectricaldata_new/commit/2ec0cf13ec462efa2e57a75d9f871a87f9d13ff0))

## [1.1.0-dev.7](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.6...1.1.0-dev.7) (2025-12-19)

### Bug Fixes

* **web:** sync OfferSelector state on page navigation ([2ec0cf1](https://github.com/MyElectricalData/myelectricaldata_new/commit/2ec0cf13ec462efa2e57a75d9f871a87f9d13ff0))

## [1.1.0-dev.6](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.5...1.1.0-dev.6) (2025-12-18)

### Bug Fixes

* **ci:** remove 'v' prefix from helm tags ([8f2557e](https://github.com/MyElectricalData/myelectricaldata_new/commit/8f2557e4d2816f668e4c24211d61e2d9ca73e73c))
* **ci:** trigger release only on apps changes ([dfd98af](https://github.com/MyElectricalData/myelectricaldata_new/commit/dfd98afaba9f3602e7827b84a52b392003852f7b))
* **ci:** use config swap instead of extends for helm release ([9eee893](https://github.com/MyElectricalData/myelectricaldata_new/commit/9eee893fce951e853915f204810f045796a46467))
* **ci:** use helm/vX.X.X tags without GitHub releases ([9ab83ed](https://github.com/MyElectricalData/myelectricaldata_new/commit/9ab83eda8a0da3dcfd0d12a6af94b51f9ddab510))
* **valkey:** update existingSecretKey to existingSecretPasswordKey in values.yaml and helpers.tpl ([9597eb4](https://github.com/MyElectricalData/myelectricaldata_new/commit/9597eb4e65947f6a18e6bdeb95f85b78126204cd))
* **web:** handle nested arrays in offpeak_hours parsing ([609661b](https://github.com/MyElectricalData/myelectricaldata_new/commit/609661bdcd45913e37224b238264181a68594caf))

## [1.1.0-dev.5](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.4...1.1.0-dev.5) (2025-12-18)

### Features

* **ci:** separate CI/CD pipelines for apps and Helm chart ([6480760](https://github.com/MyElectricalData/myelectricaldata_new/commit/64807609ad5f7dc2c8c14701e569d67e6fe6573d))

## [1.1.0-dev.4](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.3...1.1.0-dev.4) (2025-12-18)

### Features

* **helm:** migrate from Redis to Valkey ([5dd2ada](https://github.com/MyElectricalData/myelectricaldata_new/commit/5dd2adae748dd4a7e5fa6d2185162c7734823704))

## [1.1.0-dev.3](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.2...1.1.0-dev.3) (2025-12-18)

### Bug Fixes

* **helm:** correct postgres/valkey condition and configmap references ([61087da](https://github.com/MyElectricalData/myelectricaldata_new/commit/61087daf59425a7fe0d7ef7f928c6dc98cadc5b7))

## [1.1.0-dev.2](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.1.0-dev.1...1.1.0-dev.2) (2025-12-14)

### Bug Fixes

* **ci:** add extra_plugins for semantic-release action ([5a1561f](https://github.com/MyElectricalData/myelectricaldata_new/commit/5a1561f2e7fc4e2b1e576fd3163a44cccb716ba4))
* **ci:** use semantic-release action for proper GitHub outputs ([4c5ead6](https://github.com/MyElectricalData/myelectricaldata_new/commit/4c5ead6f34f38f9ade6530a6e6d05e420c31b70d))

## [1.1.0-dev.1](https://github.com/MyElectricalData/myelectricaldata_new/compare/1.0.0...1.1.0-dev.1) (2025-12-14)

### Features

* **ci:** add build validation before semantic-release ([f261fe7](https://github.com/MyElectricalData/myelectricaldata_new/commit/f261fe7faee82629eeb519ea6314fdab8fe322df))
* **ci:** add pre-commit hooks for linting ([c1614a9](https://github.com/MyElectricalData/myelectricaldata_new/commit/c1614a9e813a62328ed20eea777ea47b62843f45))

### Bug Fixes

* **api:** remove unused imports ([6da4bf0](https://github.com/MyElectricalData/myelectricaldata_new/commit/6da4bf0955de2b360fea0cb3f660b74cf25c0df0))
* **api:** resolve all 204 mypy type errors ([3e45d5b](https://github.com/MyElectricalData/myelectricaldata_new/commit/3e45d5b8e38c663216ddcc69dacad6035a7f1d20))
* **api:** resolve all ruff linting errors ([d3366b3](https://github.com/MyElectricalData/myelectricaldata_new/commit/d3366b38bf1ece18179c9ad1c8ccdfa9899abde6))
* **ci:** add mypy to dependency-groups for CI type checking ([717f99d](https://github.com/MyElectricalData/myelectricaldata_new/commit/717f99d1aaf1634780d5c8d80b1c8cbefcec9984))

## 1.0.0 (2025-12-13)

### Features

* add /copilot slash command for automatic Copilot review fixes ([#70](https://github.com/MyElectricalData/myelectricaldata_new/issues/70)) ([26446cd](https://github.com/MyElectricalData/myelectricaldata_new/commit/26446cde5ee649d3cc3b049242d6a81f8a45ba44))
* Add API documentation page with Swagger UI integration and custom theming ([42c57b3](https://github.com/MyElectricalData/myelectricaldata_new/commit/42c57b33fbe9e3ba5387c68d62b051ada4ec52d5))
* Add comprehensive design guidelines for Dark Mode and Responsive Design ([65e733d](https://github.com/MyElectricalData/myelectricaldata_new/commit/65e733d6911f4db499e498098e49000212a34425))
* Add comprehensive documentation for landing page, admin panel, authentication, database setup, development mode, Docker configuration, and data comparison script ([d971f43](https://github.com/MyElectricalData/myelectricaldata_new/commit/d971f43421d44dddcbf5c2c9a10d56cb7da18552))
* Add comprehensive documentation for various application pages including admin, API, consumption, contribute, dashboard, ecoWatt, FAQ, production, settings, signup, simulator, and tempo ([0e0eed4](https://github.com/MyElectricalData/myelectricaldata_new/commit/0e0eed4042f2198c9498654d4e4a4b97deb8c468))
* Add custom logger utility with debug mode support ([94e43f4](https://github.com/MyElectricalData/myelectricaldata_new/commit/94e43f4d3c2ec924d78fa101a10c63b57ecc0182))
* add date utilities and demo data generation ([446cfc0](https://github.com/MyElectricalData/myelectricaldata_new/commit/446cfc020e3af2bcf758a1ecf041768f6681ad0f))
* add demo mode restrictions and UI improvements for settings and simulator ([fcc1ecf](https://github.com/MyElectricalData/myelectricaldata_new/commit/fcc1ecfacde9a19611a7870874b8cdf70c7a0a26))
* add Docusaurus documentation site and UX improvements ([587baf3](https://github.com/MyElectricalData/myelectricaldata_new/commit/587baf3b24fe44b67703fa1797a9da64b9f075c5))
* Add EcoWatt page for real-time electricity network monitoring and statistics ([eb641a4](https://github.com/MyElectricalData/myelectricaldata_new/commit/eb641a493f3d37db6c82c2b9e3aa64b3901c57fb))
* Add integration documentation for Home Assistant, Jeedom, MQTT, and VictoriaMetrics ([84c6844](https://github.com/MyElectricalData/myelectricaldata_new/commit/84c6844658e9c6a41d8f90c367f09170bacbf8d1))
* add new animated landing page (v2) with enhanced visuals and interactivity ([b7d66fd](https://github.com/MyElectricalData/myelectricaldata_new/commit/b7d66fd7101868ea8f4ceb7314b50f8651d526ad))
* Add offer_url to energy offers and update scrapers ([049472c](https://github.com/MyElectricalData/myelectricaldata_new/commit/049472ca7cbbe23ec17d5345041d2b38ab6f3bcf))
* Add Onboarding Tour component for guided user experience ([a29c1f0](https://github.com/MyElectricalData/myelectricaldata_new/commit/a29c1f02b54bb4c7907339fbc1f7a1f9deb85035))
* Add padding to various pages and enhance headers with icons for better UI consistency ([133bbd5](https://github.com/MyElectricalData/myelectricaldata_new/commit/133bbd5cd577f5a2b9082dfbbfb210dda0c57116))
* Add RTE Tempo API integration with caching and frontend components ([974f801](https://github.com/MyElectricalData/myelectricaldata_new/commit/974f801461a679e132bfe3b3bd3ea39f8aa762a1))
* Add testing rules documentation and coverage objectives ([d43ea7e](https://github.com/MyElectricalData/myelectricaldata_new/commit/d43ea7e6837818586d156c3bb9bfc2cba280ba01))
* add unified PDL selector header to Dashboard, Tempo, Ecowatt, and Contribute pages ([39041db](https://github.com/MyElectricalData/myelectricaldata_new/commit/39041dbd98d510f9ad97692753000f70f965bea4))
* **admin-offers:** détection dynamique des scrapers disponibles ([d561b40](https://github.com/MyElectricalData/myelectricaldata_new/commit/d561b409185f1a9a7eeaff0eee995e7ebbedefd1))
* **Admin:** ajouter des fonctionnalités de gestion des utilisateurs, y compris la création, la suppression, la réinitialisation de mot de passe et l'affichage des statistiques des utilisateurs ([be5f4c6](https://github.com/MyElectricalData/myelectricaldata_new/commit/be5f4c62073e4a5570ffab0adee20029df0bdd1f))
* **AdminOffers:** mettre à jour les offres d'ALPIQ avec de nouvelles descriptions ([199d90f](https://github.com/MyElectricalData/myelectricaldata_new/commit/199d90fe1df11c533e2248932f835ae4e1234cf0))
* Ajouter API endpoints et migrations pour le système de fournisseurs d'énergie ([423b956](https://github.com/MyElectricalData/myelectricaldata_new/commit/423b9564dc8a634ab08d32a1b5e7ec7b64d305e2))
* Ajouter des sections sur les filtres et le tri dans le guide de design pour améliorer l'expérience utilisateur ([04ee4e0](https://github.com/MyElectricalData/myelectricaldata_new/commit/04ee4e0d97c6f094b6ace5698fd8d78694dc71b5))
* ajouter init containers pour gérer l'ordre de démarrage ([84c2a37](https://github.com/MyElectricalData/myelectricaldata_new/commit/84c2a3731e49884dc0bbc2355b67d5a48ae35e78))
* ajouter injection runtime des variables d'env frontend et config Enedis ([56818e0](https://github.com/MyElectricalData/myelectricaldata_new/commit/56818e03cd5f78fd723939933836e250dfeeea9e))
* Ajouter la fonctionnalité de liaison entre PDL de consommation et PDL de production pour des graphiques combinés ([b2e5794](https://github.com/MyElectricalData/myelectricaldata_new/commit/b2e5794a6becbade46284077ab76041fcce168ab))
* Ajouter la gestion des plages horaires creuses avec options d'incrémentation et de décrémentation ([c6c7ae0](https://github.com/MyElectricalData/myelectricaldata_new/commit/c6c7ae0c78e285bd5343eae06f3e765f3df8e270))
* ajouter la gestion des secrets et des configurations d'application dans Helm ([11ac8f4](https://github.com/MyElectricalData/myelectricaldata_new/commit/11ac8f4513e44e4833df502b2885c8d8e64a1ab1))
* Ajouter un guide de design complet pour MyElectricalData ([be360a0](https://github.com/MyElectricalData/myelectricaldata_new/commit/be360a03eb09a55aa5e313d72668df79197a09e4))
* ajouter workflow GitHub Actions pour builds Docker multi-arch ([c096b8d](https://github.com/MyElectricalData/myelectricaldata_new/commit/c096b8de6987c228969d109165154ac27747fb0d))
* Améliorer l'interface AdminLogs et optimiser le stockage des logs dans Redis ([4b8420c](https://github.com/MyElectricalData/myelectricaldata_new/commit/4b8420cce6da61171f7675b41c089187a2979b29))
* Améliorer l'interface utilisateur des composants de consommation avec des styles réactifs et des boutons d'exportation ([2d8dfec](https://github.com/MyElectricalData/myelectricaldata_new/commit/2d8dfec1ea969bd2ef4afcacbaa179790b1fbad6))
* Améliorer l'UI du panneau de filtres des logs avec header réduit interactif ([b7fa74d](https://github.com/MyElectricalData/myelectricaldata_new/commit/b7fa74d73bea0890554efac0a4e0740bcc620f0c))
* Améliorer la gestion des PDL avec réorganisation par glisser-déposer et mise à jour de la documentation ([f50bf67](https://github.com/MyElectricalData/myelectricaldata_new/commit/f50bf67658bf4bb81a4a1778fd75218263789034))
* améliorer la mise en page réactive des composants de consommation ([b7e6f3d](https://github.com/MyElectricalData/myelectricaldata_new/commit/b7e6f3d3bdbd0dd197049d1a5da44a140d4dedf0))
* améliorer le flux OAuth et l'UX du Dashboard après consentement ([46a4269](https://github.com/MyElectricalData/myelectricaldata_new/commit/46a426909fb90da5252664aca0dcf9a6b4c3470c))
* Améliorer le style des composants PDLCard et Dashboard avec des ajustements de couleurs et de tailles ([3414421](https://github.com/MyElectricalData/myelectricaldata_new/commit/341442141f6ce105255a153ea2df3fd3a32f7a36))
* Améliorer le style et l'interactivité des composants PDLCard avec des ombres et des couleurs mises à jour ([a9c46cc](https://github.com/MyElectricalData/myelectricaldata_new/commit/a9c46ccf418fcdce3336ae25341153df52b68c7b))
* **api:** add automatic seeding of default roles and permissions ([#31](https://github.com/MyElectricalData/myelectricaldata_new/issues/31)) ([1049553](https://github.com/MyElectricalData/myelectricaldata_new/commit/104955319a7344e9920f75fdbb5e55e273c131cf))
* **api:** sync ADMIN_EMAILS users with admin role at startup ([#32](https://github.com/MyElectricalData/myelectricaldata_new/issues/32)) ([67cbb4e](https://github.com/MyElectricalData/myelectricaldata_new/commit/67cbb4e905d066e319dcaf74652cee159837243a))
* avertissement fallback + correction URLs manquantes ([a035577](https://github.com/MyElectricalData/myelectricaldata_new/commit/a035577159de610889be9883844caff0d10b0e5a))
* cache scraped offers + auto-create providers with defaults ([4a6d334](https://github.com/MyElectricalData/myelectricaldata_new/commit/4a6d334567fee4b97a9070ec554510e4be245a72))
* **chat:** améliorer la gestion de la saisie avec un textarea redimensionnable et prise en charge des nouvelles lignes ([51f4d1e](https://github.com/MyElectricalData/myelectricaldata_new/commit/51f4d1e34ed7bbf2b76b45954aa8fc0768cb9950))
* **ci:** configure semantic-release with develop/main workflow ([a78a3ec](https://github.com/MyElectricalData/myelectricaldata_new/commit/a78a3ecd796ecb7298c21e57b2e23a49da5345ab))
* **commands:** add /sync command for worktree synchronization ([#56](https://github.com/MyElectricalData/myelectricaldata_new/issues/56)) ([200201b](https://github.com/MyElectricalData/myelectricaldata_new/commit/200201bec24762a927efebb8249b79b5cb1b9f44))
* **conductor:** add Docker Compose dev environment with dynamic ports ([#78](https://github.com/MyElectricalData/myelectricaldata_new/issues/78)) ([cdf5e99](https://github.com/MyElectricalData/myelectricaldata_new/commit/cdf5e99f5ae06707f21fb08927bdc4f51f1b2312))
* **contribute:** ajouter des onglets pour la gestion des contributions et améliorer la navigation ([d761afa](https://github.com/MyElectricalData/myelectricaldata_new/commit/d761afad496341890834a191bfbe47df8a2fb71b))
* **contributions:** add rejection modal with message storage and email notifications ([#77](https://github.com/MyElectricalData/myelectricaldata_new/issues/77)) ([e15ba72](https://github.com/MyElectricalData/myelectricaldata_new/commit/e15ba72ac24dbbdb02d7940d83dd37112fc15070))
* **contributions:** add rejection shortcuts and email notification ([a3ebcf3](https://github.com/MyElectricalData/myelectricaldata_new/commit/a3ebcf3a6c090e047ab7fecba83ee800187581db))
* **contributions:** ajouter la gestion des messages non lus et le comptage des contributions non lues ([6ce2230](https://github.com/MyElectricalData/myelectricaldata_new/commit/6ce2230dfcc579c36d4127d8e241b710c7ba9d20))
* **dashboard:** ajouter un bouton de consentement avec tooltip et image pour Enedis ([60df747](https://github.com/MyElectricalData/myelectricaldata_new/commit/60df7478bee9baf6de2a13d84c3890a024972d85))
* **dashboard:** mettre à jour le style du bouton de consentement avec des marges et une couleur de fond ([83d5fa1](https://github.com/MyElectricalData/myelectricaldata_new/commit/83d5fa18aea4026d8a60d19f71a903ec0616ebad))
* **db:** modifier la contrainte de clé étrangère pour linked_production_pdl_id afin d'utiliser ON DELETE SET NULL ([6da2a77](https://github.com/MyElectricalData/myelectricaldata_new/commit/6da2a775b7de3626d904809bb234c514b204d3a2))
* **demo:** Implement demo account creation and data generation ([c039742](https://github.com/MyElectricalData/myelectricaldata_new/commit/c03974289e6bbed0b9ee178034813fec6c95f67a))
* **docs:** ajouter une sidebar pour le Client Local avec des sections d'introduction, d'installation et de configuration ([517b8e9](https://github.com/MyElectricalData/myelectricaldata_new/commit/517b8e995ee43405828653f65d28ea8dd2f63190))
* **engie-scraper:** switch from PDF to HelloWatt web scraping ([#67](https://github.com/MyElectricalData/myelectricaldata_new/issues/67)) ([d5a6d71](https://github.com/MyElectricalData/myelectricaldata_new/commit/d5a6d713fdc84e1f93edf5acca66303856db8087))
* Enhance Admin and API documentation pages, improve layout and transitions ([3b50f73](https://github.com/MyElectricalData/myelectricaldata_new/commit/3b50f7368a8d85b2c003fd4265e397c59ea35e3c))
* Enhance admin contributions page with detailed features and statistics ([261aeb4](https://github.com/MyElectricalData/myelectricaldata_new/commit/261aeb40f61c9e2b750a3983f9ec98d3c142530c))
* Enhance Admin PDL Management Interface ([e22acb7](https://github.com/MyElectricalData/myelectricaldata_new/commit/e22acb7b2d9cdbd58461c320ea0b36c0c59be135))
* Enhance PowerPeaks component with multi-year selection and zoom functionality ([dc12655](https://github.com/MyElectricalData/myelectricaldata_new/commit/dc12655d7f8f9b02cf5e4b19b2329119796b98a3))
* Implement cache synchronization using BroadcastChannel API ([66c98e7](https://github.com/MyElectricalData/myelectricaldata_new/commit/66c98e7d2481ff385b96b443e2f42380976faf60))
* Implement TEMPO calendar page with data fetching and visualization ([e1226ca](https://github.com/MyElectricalData/myelectricaldata_new/commit/e1226ca86945ef95713545bac9969e64799b8ed3))
* Intégrer Ekwateur et compléter l'écosystème de 8 fournisseurs d'énergie ([5f80927](https://github.com/MyElectricalData/myelectricaldata_new/commit/5f809272bca1651e31b31981c80a995e0a42c306))
* **layout:** ajouter des sous-menus déroulants pour les sections Consommation et Administration ([386ba20](https://github.com/MyElectricalData/myelectricaldata_new/commit/386ba2004ae3dc96970391bd4302a566d1a7c8d3))
* **LoadingProgress:** ajouter une fonctionnalité d'auto-développement et d'auto-repli pour améliorer l'expérience utilisateur ([f8a6bb7](https://github.com/MyElectricalData/myelectricaldata_new/commit/f8a6bb7208cac2098e948a090d87b12237162f45))
* make demo account read-only ([#83](https://github.com/MyElectricalData/myelectricaldata_new/issues/83)) ([4e97130](https://github.com/MyElectricalData/myelectricaldata_new/commit/4e97130f3ef3588d3210b311b3b19f13cf561858))
* mise à jour des pages avec de nouveaux titres et icônes, ajout de la page "Contribuer" et amélioration de la gestion des données ([2737191](https://github.com/MyElectricalData/myelectricaldata_new/commit/2737191788c225b481bc120eaa23a27a6ac0729c))
* **OAuth:** améliorer la gestion des erreurs de format PDL et mise à jour des messages d'erreur dans le tableau de bord ([99f3131](https://github.com/MyElectricalData/myelectricaldata_new/commit/99f3131f81ed001ce1e4febf418994b8db61c924))
* **OfferSelector:** enhance pricing display and add detailed price breakdown for energy offers ([5f3e33f](https://github.com/MyElectricalData/myelectricaldata_new/commit/5f3e33f0d0b92f23a63df145601ae2e1ec2e802b))
* **price_scrapers:** ajouter le scraper Mint Énergie et mettre à jour les références dans les services ([6c69c54](https://github.com/MyElectricalData/myelectricaldata_new/commit/6c69c543babdf433bf2d72f69b0724343c5bea12))
* **production:** Afficher les PDLs de consommation avec production liée ([a61b229](https://github.com/MyElectricalData/myelectricaldata_new/commit/a61b2291004f0acedfb8026bd592d2b3c6702364))
* Refactor consumption and production data fetching with Zustand store integration ([7df10d2](https://github.com/MyElectricalData/myelectricaldata_new/commit/7df10d2d09380089f6186abae3fddd63c7936541))
* Refactor logging and debug mode handling across components for improved clarity and performance ([a731835](https://github.com/MyElectricalData/myelectricaldata_new/commit/a7318351bba7db77018b5c5b07f46128294383d4))
* refactor Production page to use new DetailedCurve component and implement responsive day count hook ([f2ede8d](https://github.com/MyElectricalData/myelectricaldata_new/commit/f2ede8d2602c33e95561621c7e197773f665adf4))
* rendre les servers Swagger dynamiques selon FRONTEND_URL ([0efad83](https://github.com/MyElectricalData/myelectricaldata_new/commit/0efad83fbd76a8e9ba4a1ff4c2e2ee102cf13b03))
* Réorganiser et améliorer le composant InfoBlock pour une meilleure présentation des informations ([cfcb01b](https://github.com/MyElectricalData/myelectricaldata_new/commit/cfcb01b3ac0af1c60a4f4f9d4944ee6f07af389f))
* **scraper:** add Octopus Energy price scraper with HelloWatt integration ([#69](https://github.com/MyElectricalData/myelectricaldata_new/issues/69)) ([77b307a](https://github.com/MyElectricalData/myelectricaldata_new/commit/77b307aca468847a2f794df876ee942ab0b17cb9))
* **scraper:** add Vattenfall energy provider with price extraction ([#68](https://github.com/MyElectricalData/myelectricaldata_new/issues/68)) ([f06de22](https://github.com/MyElectricalData/myelectricaldata_new/commit/f06de22f52c15fb793b1a7641a09f9702d93dd0d))
* **scrapers:** add UFC Que Choisir energy price scraper ([38d8fee](https://github.com/MyElectricalData/myelectricaldata_new/commit/38d8fee65e7e4b7bded35bf48046acf811bd2d00))
* **scrapers:** add UFC Que Choisir energy price scraper ([#76](https://github.com/MyElectricalData/myelectricaldata_new/issues/76)) ([6610dc5](https://github.com/MyElectricalData/myelectricaldata_new/commit/6610dc5627d8f023ea124d609d2d05159e206fed))
* **scrapers:** améliorer UX sync + thread pool + mutex ([e421cf2](https://github.com/MyElectricalData/myelectricaldata_new/commit/e421cf2303e97d3683f99ce9f5477e6ad8a21f73))
* **seo:** implement comprehensive SEO improvements ([#23](https://github.com/MyElectricalData/myelectricaldata_new/issues/23)) ([2826a9c](https://github.com/MyElectricalData/myelectricaldata_new/commit/2826a9ce3d71559ce18e16c8849adb19e8d41834))
* **Simulator:** Add period selection functionality with custom date range support ([bfad935](https://github.com/MyElectricalData/myelectricaldata_new/commit/bfad935de0b7c59c4287c5dae18f58fa7dd556a0))
* **simulator:** ajouter la prise en charge de l'offre ZEN_FLEX et améliorer les informations de simulation ([3ef1216](https://github.com/MyElectricalData/myelectricaldata_new/commit/3ef12164d8e98c7c5ffdf7d37e2c81e85bd384cf))
* **Simulator:** enhance simulation functionality with auto-launch and improved loading progress ([10dd001](https://github.com/MyElectricalData/myelectricaldata_new/commit/10dd001c7063cfc3a81485e035e9080eb7accc41))
* **simulator:** étendre la logique de prix pour inclure les offres HC_NUIT_WEEKEND et WEEKEND ([8e87273](https://github.com/MyElectricalData/myelectricaldata_new/commit/8e87273ef3ad5fa25d79dc8bf9b956507719627d))
* **UFCQueChoisirScraper:** ajouter l'URL de l'offre pour chaque offre récupérée ([44d6352](https://github.com/MyElectricalData/myelectricaldata_new/commit/44d6352b2f28abd462201877b06b1f975c52fce5))
* **web:** add password visibility toggle on login ([#46](https://github.com/MyElectricalData/myelectricaldata_new/issues/46)) ([3641ab3](https://github.com/MyElectricalData/myelectricaldata_new/commit/3641ab346e56c55da279803a8081241095111228)), closes [#41](https://github.com/MyElectricalData/myelectricaldata_new/issues/41) [#43](https://github.com/MyElectricalData/myelectricaldata_new/issues/43) [#45](https://github.com/MyElectricalData/myelectricaldata_new/issues/45)
* **web:** add theme-aware logo switching ([186ff83](https://github.com/MyElectricalData/myelectricaldata_new/commit/186ff83f66af8b77f670703c0b1425d0c21f459e))

### Bug Fixes

* Add location state handling for navigation in ProtectedRoute, Login, and Settings components ([e6c65a4](https://github.com/MyElectricalData/myelectricaldata_new/commit/e6c65a4dc1de47bcb24ca8a95b02be6716148e39))
* **api:** add migration for selected_offer_id column in pdls table ([#38](https://github.com/MyElectricalData/myelectricaldata_new/issues/38)) ([f734ee9](https://github.com/MyElectricalData/myelectricaldata_new/commit/f734ee966b0b0159b59686dcdc7805054520024e))
* **conductor:** simplify config format for app detection ([#80](https://github.com/MyElectricalData/myelectricaldata_new/issues/80)) ([a39425a](https://github.com/MyElectricalData/myelectricaldata_new/commit/a39425a8a6ca23ff11d49823be923b0589d64b36))
* **conductor:** support multi-instance deployment with external services ([#79](https://github.com/MyElectricalData/myelectricaldata_new/issues/79)) ([d93523b](https://github.com/MyElectricalData/myelectricaldata_new/commit/d93523b89c827b6d89ef9f02bd981fd586e1a98f))
* **consumption:** display correct year labels for annual curve ([#50](https://github.com/MyElectricalData/myelectricaldata_new/issues/50)) ([4fa3510](https://github.com/MyElectricalData/myelectricaldata_new/commit/4fa3510656216ab2255e160133003b4ebd58bc49))
* corriger canAccessAdmin pour vérifier is_admin en plus du rôle ([cb21a08](https://github.com/MyElectricalData/myelectricaldata_new/commit/cb21a08e2a8052502cfb173d270e0f5670185fb9))
* Corriger l'alignement des jours du calendrier pour le format français ([09af206](https://github.com/MyElectricalData/myelectricaldata_new/commit/09af206090e4c691818f024e838c610364290fd2))
* corriger la détection admin (combiner DB + ADMIN_EMAILS) ([a1a187d](https://github.com/MyElectricalData/myelectricaldata_new/commit/a1a187d0728ffb759eae768ac3911c0b3b023c2f))
* corriger la gestion du propriétaire dans le workflow de publication Helm ([9289f76](https://github.com/MyElectricalData/myelectricaldata_new/commit/9289f765105379ed5f418edc4155dab5d97c687c))
* corriger le cache PDL apres consentement ([7c80d2f](https://github.com/MyElectricalData/myelectricaldata_new/commit/7c80d2f25f4f6269549a09ed33daab350d288d9d))
* corriger le positionnement des modals d'onboarding ([2e841c7](https://github.com/MyElectricalData/myelectricaldata_new/commit/2e841c76edfc03b0f3789f8b14ef8794e86837e3))
* Corriger les issues Copilot critiques et importantes sur AdminLogs ([034ff09](https://github.com/MyElectricalData/myelectricaldata_new/commit/034ff09962725be9d1ed8c4676e04415d7a2726c))
* Corriger les issues GitHub Copilot (imports et variables inutilisés) ([43e6954](https://github.com/MyElectricalData/myelectricaldata_new/commit/43e69545cafae5412023a1ba5eb8c4217c60c9ef)), closes [#3](https://github.com/MyElectricalData/myelectricaldata_new/issues/3)
* corriger position fixed du HelpButton et cache IndexedDB ([2b03e48](https://github.com/MyElectricalData/myelectricaldata_new/commit/2b03e4865fd80e6d0f24a3a3430fec8161a5b505))
* **dev:** enable recursive file watching for backend hot reload ([#75](https://github.com/MyElectricalData/myelectricaldata_new/issues/75)) ([e7ea921](https://github.com/MyElectricalData/myelectricaldata_new/commit/e7ea92152b5bf1a049080f7bd123aa523dcf2eec))
* **helm:** disable backend PVC when using PostgreSQL ([4d7fec2](https://github.com/MyElectricalData/myelectricaldata_new/commit/4d7fec2e1d191907bf557fce6a40cbccf36bc143))
* hide linked production PDLs from selector ([#73](https://github.com/MyElectricalData/myelectricaldata_new/issues/73)) ([10559d7](https://github.com/MyElectricalData/myelectricaldata_new/commit/10559d705ae9dd44cc924d6f826fc11655d86619))
* implement Ekwateur HTML parsing and update Dec 2025 prices ([#57](https://github.com/MyElectricalData/myelectricaldata_new/issues/57)) ([87c9c1d](https://github.com/MyElectricalData/myelectricaldata_new/commit/87c9c1df22b3cf5a51825ece5ea787233055bac8))
* Migrer React Query Persist vers IndexedDB pour supporter les grandes données ([9d75b38](https://github.com/MyElectricalData/myelectricaldata_new/commit/9d75b382b3723922ede2121b3b602b861f7bb55b))
* ne pas afficher localhost dans Swagger en production ([3ac244f](https://github.com/MyElectricalData/myelectricaldata_new/commit/3ac244fc804dd350a3300055eca04e1262db4579))
* remove unused applyProgress state (build error) ([a77347a](https://github.com/MyElectricalData/myelectricaldata_new/commit/a77347a91abbce4df519b466f5c37e982a98d546))
* **scraper:** fix Enercoop PDF parser to extract real prices ([#63](https://github.com/MyElectricalData/myelectricaldata_new/issues/63)) ([1c0fa86](https://github.com/MyElectricalData/myelectricaldata_new/commit/1c0fa865ba162b6e9a73dbb68c41267aec3f117d))
* **scraper:** implement Engie PDF parsing instead of fallback ([#62](https://github.com/MyElectricalData/myelectricaldata_new/issues/62)) ([3d5809f](https://github.com/MyElectricalData/myelectricaldata_new/commit/3d5809f962eb020d2ed773be5a3197efc54fa896))
* **scraper:** implement PDF parsing for TotalEnergies instead of always falling back ([#60](https://github.com/MyElectricalData/myelectricaldata_new/issues/60)) ([ca5df43](https://github.com/MyElectricalData/myelectricaldata_new/commit/ca5df4370c490fa3a0f8425640b4cf1fdffa718d))
* **scraper:** implement Priméo Énergie PDF parsing instead of fallback ([#59](https://github.com/MyElectricalData/myelectricaldata_new/issues/59)) ([a931a24](https://github.com/MyElectricalData/myelectricaldata_new/commit/a931a249ecf31b6ef324df663bcbabddb81bba07))
* **scraper:** rewrite Alpiq scraper to use HelloWatt instead of PDF ([#81](https://github.com/MyElectricalData/myelectricaldata_new/issues/81)) ([219b10f](https://github.com/MyElectricalData/myelectricaldata_new/commit/219b10fdeff4367840ec003788e9c45e481579c9))
* **scraper:** use TTC prices instead of HT for Priméo Énergie ([#64](https://github.com/MyElectricalData/myelectricaldata_new/issues/64)) ([f9e2707](https://github.com/MyElectricalData/myelectricaldata_new/commit/f9e2707c9796c6af313ebb9a9dceb21e33c299b9))
* **seo:** use v2 subdomain for beta OG images ([#29](https://github.com/MyElectricalData/myelectricaldata_new/issues/29)) ([bb28d93](https://github.com/MyElectricalData/myelectricaldata_new/commit/bb28d93a4e8a6b08d9a3cd34cb676e35424a471d))
* simplification de la configuration des sidebars en supprimant des éléments inutiles ([1fc7434](https://github.com/MyElectricalData/myelectricaldata_new/commit/1fc743457221378a0d5d727ab787154864a3157e))
* simplifier le workflow Docker pour éviter l'erreur push-by-digest ([659166e](https://github.com/MyElectricalData/myelectricaldata_new/commit/659166e13a88145d67200915bd987887684a03a2))
* **simulator:** fix cache hydration race condition with IndexedDB ([4631798](https://github.com/MyElectricalData/myelectricaldata_new/commit/463179839e8b6d3e2ad387d6d8d685b9b23704d8))
* **simulator:** resolve race condition in auto-launch with cached data ([#72](https://github.com/MyElectricalData/myelectricaldata_new/issues/72)) ([0526630](https://github.com/MyElectricalData/myelectricaldata_new/commit/052663089685ff00162f5430e351248fc2ebce7b))
* **simulator:** resolve React hooks violations ([#61](https://github.com/MyElectricalData/myelectricaldata_new/issues/61)) ([21d3993](https://github.com/MyElectricalData/myelectricaldata_new/commit/21d3993d1262dcf05cbd705bafab5d442662026e)), closes [#310](https://github.com/MyElectricalData/myelectricaldata_new/issues/310) [#310](https://github.com/MyElectricalData/myelectricaldata_new/issues/310)
* **simulator:** use subscription pattern for cache hydration ([#74](https://github.com/MyElectricalData/myelectricaldata_new/issues/74)) ([f902c18](https://github.com/MyElectricalData/myelectricaldata_new/commit/f902c18c77c23e191fbccb528d5bc735d4cf4420))
* Supprimer les variables inutilisées (LoadingStatusBadge et AdminOffers) ([98d7c09](https://github.com/MyElectricalData/myelectricaldata_new/commit/98d7c0974aaae07cbc7d741e9a476b3c42f92871)), closes [#3](https://github.com/MyElectricalData/myelectricaldata_new/issues/3)
* UI improvements - cache, tooltip, help button ([f989c02](https://github.com/MyElectricalData/myelectricaldata_new/commit/f989c02c34dc3001a59a049eefd722f0d4be5a8f))
* Update cache persistence logic for energy providers and enhance admin offers page with token checks and real-time messaging features ([14db3a2](https://github.com/MyElectricalData/myelectricaldata_new/commit/14db3a2cd407ae92907760a04c6a7eb7aa2c1945))
* use spawn context for ProcessPoolExecutor to avoid asyncio deadlocks ([f72cbd4](https://github.com/MyElectricalData/myelectricaldata_new/commit/f72cbd436fd9932149cda84bd48e681b3ec3e051))
* Utiliser UTC pour le calcul des dates dans DetailedProductionCurve ([a88f7f2](https://github.com/MyElectricalData/myelectricaldata_new/commit/a88f7f2658fde802bccd1c377557753b066947e1))
* utiliser window.__ENV__ pour l'URL API dans ApiDocs ([8a78208](https://github.com/MyElectricalData/myelectricaldata_new/commit/8a78208fd4c7bc807499c51c254147daa4a8b1a4))
* **web:** display selected provider on initial page load ([#71](https://github.com/MyElectricalData/myelectricaldata_new/issues/71)) ([fc910ed](https://github.com/MyElectricalData/myelectricaldata_new/commit/fc910edf58e28b04ff12a9db79a99a888a1094f4))
* **web:** hide selected offer and expand info when no consumption data ([#39](https://github.com/MyElectricalData/myelectricaldata_new/issues/39)) ([823f338](https://github.com/MyElectricalData/myelectricaldata_new/commit/823f33890ac74abf9147e20f1bf5a588a006ab52))
* **web:** move @headlessui/react to react-vendor chunk ([#65](https://github.com/MyElectricalData/myelectricaldata_new/issues/65)) ([2a75fbf](https://github.com/MyElectricalData/myelectricaldata_new/commit/2a75fbf38d54b82dc1552bdf2ba58c9735109c9e))
* **web:** regenerate package-lock.json for Docker build ([#51](https://github.com/MyElectricalData/myelectricaldata_new/issues/51)) ([3cc8293](https://github.com/MyElectricalData/myelectricaldata_new/commit/3cc82938df1abf3efcef5b17684b071aa1214156))
* **web:** regenerate package-lock.json for npm ci compatibility ([#42](https://github.com/MyElectricalData/myelectricaldata_new/issues/42)) ([ebd9046](https://github.com/MyElectricalData/myelectricaldata_new/commit/ebd904657e12b43c5a4bc8f28fe6eecc427f6c03))
* **web:** resolve TypeScript build errors ([dbd6386](https://github.com/MyElectricalData/myelectricaldata_new/commit/dbd6386faf286a7432718e3aab02718e0dfcb3ad))
* **web:** resolve TypeScript build errors ([#37](https://github.com/MyElectricalData/myelectricaldata_new/issues/37)) ([92023f5](https://github.com/MyElectricalData/myelectricaldata_new/commit/92023f528e044433774a4712408d9a7d192733dc)), closes [#33](https://github.com/MyElectricalData/myelectricaldata_new/issues/33)
* **web:** uniformize page top spacing across all pages ([edd4627](https://github.com/MyElectricalData/myelectricaldata_new/commit/edd46271362e10f200c6685a41f7b21c52e0d19a))
* **web:** use object-based manualChunks to prevent circular deps ([#66](https://github.com/MyElectricalData/myelectricaldata_new/issues/66)) ([61de93a](https://github.com/MyElectricalData/myelectricaldata_new/commit/61de93a39e8f135453872b051a06dca1e126de82))

### Performance

* paralléliser les builds Docker backend et frontend ([5c90b92](https://github.com/MyElectricalData/myelectricaldata_new/commit/5c90b92f4c9a764cade00e4cddc4f02863c991b4))
* use ProcessPoolExecutor for PDF parsing to bypass GIL ([b3fd338](https://github.com/MyElectricalData/myelectricaldata_new/commit/b3fd338a53e43db2cf2cbc44bf73efaa52eb317a))
* **web:** optimize frontend build with SWC and code splitting ([#55](https://github.com/MyElectricalData/myelectricaldata_new/issues/55)) ([1e73759](https://github.com/MyElectricalData/myelectricaldata_new/commit/1e73759380676c1b0ddfa43b7490f892426ec992))

### Refactoring

* Corriger les nitpicks Copilot sur AdminLogs et Layout ([bb767b3](https://github.com/MyElectricalData/myelectricaldata_new/commit/bb767b3fea7876dfae791995f0393b9497f73b03))
* remplacer Landing v1 par v2 + ajout blague disponibilité ([a8298fe](https://github.com/MyElectricalData/myelectricaldata_new/commit/a8298fed78dea6cec2155ba708e82a1fb0d63877))
* **simulator:** supprimer les calculs de différence de coût pour les offres ([fc2f447](https://github.com/MyElectricalData/myelectricaldata_new/commit/fc2f4472705288eda9ad937bfdb4a2a6c5e0d87c))

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **[Frontend]** Calendrier de navigation - Correction de l'alignement des jours pour le calendrier français
  - Les jours sont maintenant correctement alignés avec lundi en première colonne (L, M, M, J, V, S, D)
  - Fix: `getDay()` retourne 0 pour dimanche, ajout de transformation modulo `(getDay() + 6) % 7`
  - Exemple: 4 septembre 2025 (jeudi) s'affiche maintenant dans la colonne jeudi et non vendredi
  - Fichier: `apps/web/src/pages/Consumption/components/DetailedLoadCurve.tsx`

### Improved
- **[Frontend]** Navigation par jour dans la courbe de charge détaillée
  - Boutons de jour affichés sur 2 lignes : date complète (ex: "lun. 17 nov") + puissance (ex: "12.45 kWh")
  - Nombre de jours visibles calculé dynamiquement avec hook `useResponsiveDayCount`
  - Ajustement automatique selon la largeur du conteneur (min 3 jours, max 14 jours)
  - Fichier: `apps/web/src/pages/Consumption/hooks/useResponsiveDayCount.ts`

- **[Frontend]** Sélection de date intelligente dans le calendrier
  - Lorsqu'une date nécessite le chargement d'une nouvelle semaine, l'utilisateur arrive maintenant sur la date sélectionnée (et non la première date)
  - Implémentation d'un état `pendingDateSelection` pour mémoriser la date cliquée pendant le chargement
  - Navigation automatique vers le bon jour une fois les données chargées

- **[Frontend]** Comparaisons semaine -1 et année -1
  - Extraction automatique des données de comparaison depuis le cache React Query
  - Parcours intelligent des queries en cache pour trouver les données par filtrage de date
  - Support du format batch avec filtrage sur `interval_reading` array
  - Boutons de comparaison toujours actifs (suppression des checks de disponibilité restrictifs)
