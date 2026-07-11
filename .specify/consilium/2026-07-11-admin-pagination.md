---
consilium: 2026-07-11
topic: Shared pagination component for the admin audit trail and user list
slug: admin-pagination
verdict: approved
route: direct-verified
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# Shared pagination for the admin audit trail and users

## Узгоджена пропозиція

Адмінський журнал аудиту (/admin/audit) отримує повноцінну серверну пагінацію (сьогодні - обрізка
200 останніх рядків без навігації), і разом з екраном користувачів (/admin/users, вже пагінований)
переходить на один спільний компонент пейджера. Компонент дає навігацію сторінками і явний вибір
розміру сторінки - select з набором пресетів (10/20/50/100) плюс пункт "custom", що розкриває
числовий інпут для довільного значення кратного 10. Безкінечний скрол - свідомо ні, користувач
хоче саме навігацію. Пагінація лишається offset-базованою (не cursor) - обсяги малі (журнал - тисячі
рядків за сезон, користувачі - до MAX_USERS).

## Межі та обмеження

- В скоупі: спільний `Pager` компонент (client/src/components); контракт `AuditRepository`
  розширюється (list(limit, offset) + count()); спільна pagination-база у validation.ts (одна
  іменована константа меж, використовувана і users-, і audit-схемою); wire-конверт аудиту переїжджає
  на `Paginated<AuditLogEntry>` (старий `{entries}` вмирає без back-compat шару); users-роут
  переходить з ручного `safeParse` на `parseOrThrow`; interface -> type для зачеплених `Paginated` і
  `AuditLogEntry` (не весь shared/types.ts).
- Поза скоупом: cursor-пагінація; retention/очищення журналу; фільтр/пошук по аудиту; збереження
  page/pageSize в URL або localStorage; узагальнений list-механізм понад цей один компонент.
- Реалізація двома кроками: (1) клієнтський Pager + міграція AdminUsers (сервер не чіпається - схема
  вже приймає pageSize до 100); (2) серверна пагінація аудиту + міграція AdminAudit + users.ts на
  parseOrThrow.

## Зауваження, що вціліли

- [підтверджено] Контракт: примітиви `list(limit, offset)` + `count()` у драйвері (стиль наявних
  контрактів - countByTournament, count() у UserRepository), конверт `Paginated` збирає сервіс
  `listAudit`, не драйвер (best-practices, performance).
- [підтверджено] Два плоскі запити (COUNT + SELECT LIMIT/OFFSET), без window function; вартість на
  реальних обсягах (тисячі рядків) - копійки, cursor відхилено цифрами (performance; проба
  допитувача підтвердила: node:sqlite OFFSET за межею таблиці повертає порожній результат, не throw
  і не спотворення - жодного окремого захисту від переповнення офсету не треба, лише коректний
  `.max()` на самому page).
- [підтверджено] Серверні межі на `pageSize` І `page` через ОДНУ спільну іменовану константу
  (pagination-об'єкт у validation.ts), базова pagination-схема витягнута і users-, і audit-схема її
  розширюють (security, best-practices, nitpicker).
- [підтверджено] "Кратно 10" - клієнтське зручнення (округлення на blur/Enter, НЕ на кожен
  keystroke), у zod лишаються тільки межі int 1..100 (security, performance, pragmatist).
- [підтверджено] Зміна pageSize скидає page на 1 у обох хуках (nitpicker, best-practices).
- [підтверджено] page/pageSize - useState у хуці сторінки, НЕ URL: `AdminLayout.tabTo` (рядок 86-87)
  переносить увесь query-рядок через усі 5 вкладок, тож query-параметр сторінки протікав би між
  Users і Audit; допитувач підтвердив фактом коду (best-practices).
- [підтверджено] `{entries}` -> `Paginated<AuditLogEntry>` без back-compat шару (один інстанс,
  клієнт+сервер деплояться разом); ліміт 200 вмирає, total = справжній COUNT(*) (best-practices,
  nitpicker).
- [підтверджено] i18n: пейджер-ключі переїжджають зі `adminUsers.prev/next/page` у спільний
  `pager.*` namespace усіх 3 мов; старі ключі видалені, дефолт розміру уніфікований на 20 (був
  розсинхронізований: клієнт 10 проти схеми 20) (nitpicker, pragmatist).
- [підтверджено] Попутні виправлення в зоні робіт: відсутній `t` у deps `useAdminUsers.load`;
  `PAGE_SIZE` (SCREAMING_SNAKE_CASE) зникає разом з константою; застарілий коментар
  `AuditRepository` ("No reads in the app yet") виправлено (nitpicker).
- [підтверджено] Offset-дрейф на append-only журналі (новий запис зсуває вікно сторінки під час
  гортання) - прийнятий свідомо як trade-off масштабу, не блокер (security, nitpicker, best-practices).
- [підтверджено] users.ts роут переходить з ручного `safeParse + throw new AppError` на
  `parseOrThrow` - той самий рудимент, від якого сам хелпер писався, лишався непочищеним (nitpicker).

## Позначене допитувачем

- [суперечить] Форма контролу розміру сторінки: pragmatist і best-practices пропонували
  `<input>` + `<datalist>` замість "дропдаун + окремий інпут поруч" (два редактори одного значення -
  дрейф без шкоди, лише UI-складність). Допит виявив межу самої заміни: datalist для number-інпутів
  має нерівну підтримку показу пресетів (Chrome фільтрує за префіксом уведеного, Safari/iOS
  історично неповний), тобто "видимого дропдауна" могло не бути. Рішення користувача: select з
  пунктом "custom", що розкриває числовий інпут - один видимий редактор у кожен момент, пресети
  завжди видимі в select.

## Свідомо не робимо

- `<input>` + `<datalist>` для розміру сторінки: відхилено користувачем через нерівну браузерну
  підтримку видимості пресетів.
- Два окремі контроли (select завжди видимий + інпут завжди видимий поруч): два редактори одного
  значення, дрейф без доданої користі.
- Cursor-пагінація, retention журналу, пошук по аудиту, URL/localStorage для page-стану,
  узагальнений list-механізм: поза потребою цієї теми.

## Маршрут виконання

- Рекомендація ради: direct-verified (5/5, одностайно) - зміна за наявним взірцем (users-пагінація
  вже жива), але перетинає storage-контракт + wire + два UI-екрани, тому потрібен прогін наживо, а
  не лише typecheck.
- Рішення користувача: підтвердив direct-verified; форма контролу - select з опцією custom;
  users.ts safeParse переписати на parseOrThrow.
- Verification-список:
  1. server typecheck + lint чисті; client typecheck чистий.
  2. curl з межовими query на /admin/audit і /admin/users: pageSize=0, pageSize=101, page=0,
     page=1e15, сміттєвий рядок - усі відхиляються 400 або клампляться коректно, без 500.
  3. Out-of-range page (за межею total) - порожній items, коректний total, без помилки.
  4. CDP-прогін обох сторінок: навігація prev/next, зміна розміру через пресет, зміна розміру через
     custom-інпут (blur і Enter коммітять, keystroke - ні), скидання page на 1 при зміні розміру,
     порожній список.
  5. grep по client/src на `adminUsers.prev`, `adminUsers.next`, `adminUsers\.page\b` - нуль
     збігів (мертві ключі не лишились).
  6. AuditLogEntry id/ts/actorId/username/action/target незмінні на wire, лише конверт навколо новий.
