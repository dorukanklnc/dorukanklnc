# MVP scope

> Working codename: **CampusOS** (temporary). Default product language: Turkish; architecture is
> i18n-ready from day one. Progress is tracked in
> [IMPLEMENTATION_CHECKLIST](../IMPLEMENTATION_CHECKLIST.md).

## 1. Who we sell to

Private schools, colleges, academies, course centers and education groups (multi-campus chains).
The economic buyer is the owner/principal; daily users are accounting, student affairs,
admissions staff and teachers.

## 2. Problems the MVP solves

1. **Collections are opaque.** Schools cannot answer "who owes us money today?", "how much cash
   arrives this month?" or "what is our collection rate?" without spreadsheets.
2. **Admissions leak.** Leads live in notebooks and WhatsApp; conversion to enrollment means
   re-typing the same data.
3. **Access is all-or-nothing.** Teachers see payment information, accountants see guidance notes,
   and nobody can tell who changed what.
4. **Existing tools are slow and hard to navigate.** Deep menus, no search, one dashboard for everybody.

## 3. Product principles

- Answer business questions, not just store records.
- Role-specific experiences: each role sees the workspace it needs and nothing else.
- Find anything in two keystrokes (⌘K / Ctrl+K), only within what you are allowed to see.
- Dense but calm UI; tables and forms are first-class.
- Nothing fake: no placeholder charts, no dead buttons; unimplemented modules are hidden or marked
  as planned.

## 4. Modules

Status legend: **Built** (implemented in this iteration), **Partial** (foundation built, UI or
workflow incomplete), **Planned** (designed, not built).

|     | Module                         | Scope in MVP                                                                                                                                                           | Status                                                |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| A   | Dashboard                      | Role-specific widgets on real data (owner/principal, accounting, teacher, student affairs)                                                                             | Partial                                               |
| B   | Global search / command center | ⌘K palette: navigation, quick actions, permission-aware search across students, guardians, payments                                                                    | Partial                                               |
| C   | Admissions CRM                 | Leads, sources, statuses, follow-ups, assignment, conversion to student + guardian + enrollment + agreement                                                            | Planned (phase 2)                                     |
| D   | Students                       | List with filters/search/sort/pagination, create, profile with permission-aware tabs, archive                                                                          | Built                                                 |
| E   | Guardians                      | Create with student, relationships, financially responsible guardian                                                                                                   | Partial                                               |
| F   | Academic structure             | Academic years, grade levels, classes, rosters, teacher assignments                                                                                                    | Partial (data model + seed; management UI in phase 4) |
| G   | Personnel                      | Basic personnel records linked to user accounts                                                                                                                        | Partial                                               |
| H   | Attendance                     | Daily/lesson attendance by teachers, absence follow-up                                                                                                                 | Planned (phase 4)                                     |
| I   | Collections & finance          | Agreements, discounts/scholarships, payment plans, installments, charges, payments, allocation, reversal, balances, aging, collections dashboard, mock online payments | Built (core)                                          |
| J   | Notifications / reminders      | Channel abstraction (e-mail/SMS/WhatsApp/in-app, mock providers), reminder rules, overdue workflow                                                                     | Partial                                               |
| K   | Reports                        | Collections dashboard and aging; operational reports                                                                                                                   | Partial                                               |
| L   | Users, roles, permissions      | Invitations, branch access, role assignment with anti-escalation, built-in and custom roles                                                                            | Built                                                 |
| M   | Audit log                      | Append-only audit trail with viewer and filters                                                                                                                        | Built                                                 |
| N   | Organization / branch settings | Organization profile, branches                                                                                                                                         | Built                                                 |

## 5. Role experiences

| Role            | Lands on              | Sees                                                                          | Never sees                              |
| --------------- | --------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| Owner           | Executive dashboard   | Everything in the organization                                                | —                                       |
| Principal       | Operational dashboard | Students, classes, attendance KPIs, admissions, aggregate finance KPIs        | Individual balances (unless granted)    |
| Branch manager  | Branch dashboard      | Principal view for assigned branches, branch user management                  | Other branches                          |
| Accountant      | Collections dashboard | Accounts, plans, installments, payments, aging, cash flow (assigned branches) | Attendance, academic and guidance data  |
| Teacher         | Today's classes       | Assigned classes and students, attendance                                     | Any finance information, other classes  |
| Student affairs | Student operations    | Students, guardians, admissions conversion, rosters                           | Finance details                         |
| Platform admin  | Platform console      | Organizations, provisioning                                                   | Tenant data (without a support session) |

## 6. Initial user flows

| #   | Flow                                                                                                              | Status                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Platform creates organization → first administrator invited → admin accepts invite → logs in                      | Built (API + UI)                                                             |
| 2   | School admin creates branch → invites accountant and teacher → assigns roles                                      | Built                                                                        |
| 3   | Admissions: lead → guardian → follow-up → won → convert to student                                                | Planned (phase 2)                                                            |
| 4   | Accounting creates tuition agreement/payment plan → installments generated → dashboard shows upcoming receivables | Built                                                                        |
| 5   | Accounting records payment → allocated to installments → balance changes → audit event → outbox event             | Built                                                                        |
| 6   | Installment becomes overdue → reminder workflow → accounting dashboard shows overdue account                      | Partial (overdue detection + dashboard; reminder delivery via mock channels) |
| 7   | Teacher opens today's class → takes attendance → cannot see finance                                               | Partial (finance isolation built and tested; attendance UI in phase 4)       |
| 8   | Principal sees authorized operational dashboard with aggregate finance KPI                                        | Built                                                                        |

## 7. Explicitly out of scope for the MVP

Exams, homework, guidance/counselling, cafeteria, transportation, library, advanced HR, payroll,
general-ledger accounting, inventory, LMS, native mobile apps, advanced timetabling,
e-government (e-Okul/MEBBİS) integrations, AI assistants. The architecture keeps room for all of
them (module catalog, permission catalog, outbox events, adapters).

## 8. Success metrics for pilots

- Time to answer "who owes us money today?" < 10 seconds.
- ≥ 90 % of payments recorded in CampusOS within the same day.
- Collection rate and overdue receivables visible to the owner without exports.
- Zero cross-tenant or cross-role data exposure (security test suite green on every change).
- New staff member productive without training on navigation (search-first UX).

## 9. Quality bar

Every implemented screen handles loading, empty, error, unauthorized and not-found states; every
visible button works; every module hidden from navigation is either not built or not permitted.
Lint, typecheck, tests and build pass on every change.
