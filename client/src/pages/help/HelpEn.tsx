/** English body of the user guide. Keep the section structure in sync with
 * HelpUa/HelpPt when editing. */
export function HelpEn({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <section className="card">
        <h3>What this site is</h3>
        <p>
          A live scoreboard for a local football tournament: a group stage followed by a
          knockout. Everything updates in real time over a live connection - scores, tables
          and the bracket change on every screen the moment an admin records a goal. You
          never need to refresh the page.
        </p>
        <p>
          Accounts have two roles: <strong>viewers</strong> see everything read-only;{' '}
          <strong>admins</strong> also record results. Registering a new account always
          creates a viewer.
        </p>
      </section>

      <section className="card">
        <h3>Getting around</h3>
        <p>
          The header is the same on every page; its title on the left always returns to
          the start. On a wide screen the tournament's own pages - Overview, Results,
          Knockouts and Teams - sit together under a single menu labelled with the page
          you are on, so you open it to move between them.
          Tournaments{isAdmin ? ', Help and Admin' : ' and Help'} stay as their own links.
        </p>
        <p>
          Your name on the right opens the account menu, which holds the language switch
          (EN / UA / PT) and the log-out button. On a narrow screen the whole header
          collapses behind the menu button - it opens a panel that lists everything at
          once, with no dropdowns.
        </p>
      </section>

      <section className="card">
        <h3>Tournaments</h3>
        <p>
          The site hosts many tournaments over time. The Tournaments page lists them all:
          what is playing right now, what is planned (with dates) and the past ones. A
          finished tournament stays available as a read-only archive - its results,
          tables and bracket are kept exactly as they ended.
        </p>
      </section>

      <section className="card">
        <h3>Overview</h3>
        <p>
          The front page shows one table per group. Tables are <em>live</em>: a match that
          is being played counts with its current score, so every goal reshuffles the
          standings immediately (a just-started 0:0 counts as a provisional draw).
        </p>
        <ul>
          <li>
            Teams are ranked by points, then wins, then goal difference, then goals scored;
            if all four are level, the head-to-head meeting decides.
          </li>
          <li>
            A <span className="help__mark help__mark--green">green</span> marker means the
            place qualifies for the knockout automatically; a{' '}
            <span className="help__mark help__mark--blue">blue</span> marker means that
            place is contested across groups for the remaining knockout spots.
          </li>
          <li>
            When a place is contested, an extra table (for example "Best 3rd places")
            ranks its teams across all groups; the top rows highlighted in green advance.
          </li>
        </ul>
      </section>

      <section className="card">
        <h3>Results</h3>
        <p>
          Every group game with its kick-off time, court and score. A red badge marks games
          that are live right now. Click any game to open its own page with a big
          scoreboard{isAdmin ? ' and, for admins, the scoring controls' : ''}.
        </p>
      </section>

      <section className="card">
        <h3>Knockouts</h3>
        <p>
          The bracket holds the largest power of two below the number of teams, so the
          group stage always eliminates someone: 35 teams make a 32-team bracket (3 are
          eliminated), and an exact 16 makes an 8-team bracket. Group places qualify in
          order - all winners, all runners-up, and so on - and the last spots are decided
          among the teams of a single place across groups.
        </p>
        <ul>
          <li>
            First-round pairings keep teams of the same group apart whenever possible;
            a same-group meeting can only happen when one group supplies more than half
            of the bracket.
          </li>
          <li>
            While the groups are still being played, names in parentheses - like
            "Seed 1 (FC Lions)" - are a live projection of the current standings. The
            parentheses disappear once the pairing is final.
          </li>
          <li>
            The same applies to later rounds: "Winner QF1 (FC Lions)" shows who is
            currently ahead in an unfinished game; a level game projects nothing.
          </li>
          <li>A level knockout game is decided by a penalty shoot-out.</li>
          <li>Click any card in the bracket to open that game's page.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Teams</h3>
        <p>
          Pick a team to see its squad: player names, jersey numbers and positions.
          The picker groups teams by their group - tap a group heading to fold it open
          or shut; any team not yet in a group appears under "No group".
        </p>
      </section>

      {isAdmin && (
        <>
          <section className="card">
            <h3>Admin: running a game</h3>
            <ul>
              <li>
                Open the game (from Results or from a bracket card) and use{' '}
                <strong>+ goal</strong> / <strong>-</strong> per side. Scoring a scheduled
                game starts it automatically; <strong>Start</strong> does the same without
                a goal.
              </li>
              <li>
                <strong>Final</strong> finishes the game. A level knockout game will not
                finish until a decisive penalty result is entered - the penalty buttons
                appear whenever the score is level.
              </li>
              <li>
                <strong>Reset</strong> freezes the game back to scheduled and KEEPS the
                score, which stays editable; only a 0:0 reset also clears the penalties.
                Viewers keep seeing a frozen score.
              </li>
              <li>
                In a knockout slot the two selects can pin either side to any team
                manually (walkover, disqualification); "Auto" returns to the derived
                participant. <strong>Reset knockout</strong> on the bracket page clears
                every knockout result at once.
              </li>
            </ul>
          </section>

          <section className="card">
            <h3>Admin: setting up the tournament</h3>
            <ul>
              <li>
                <strong>Admin - Tournaments</strong>: create tournaments ahead of time
                (name, planned dates, status). The "finished" status turns a tournament
                into an archive - every change inside it is rejected until you set it
                back to active. Only an empty tournament (no groups, teams or games) can
                be deleted, and never the last one; deleting it also clears any leftover
                knockout data automatically, so no separate reset is needed first.
              </li>
              <li>
                <strong>Export</strong> downloads a complete JSON backup of one
                tournament - groups, teams, squads, games and the bracket. Keep it as an
                off-site copy or use it to move a tournament to another server.
              </li>
              <li>
                <strong>Import</strong> restores a tournament from such a backup file:
                pick the file next to the tournament list. It always creates a brand-new
                tournament with a fresh identity - importing the same file twice makes
                two separate tournaments, and the original the file came from is never
                touched. If its name matches one already in the list, "(2)", "(3)" and
                so on is appended so the two are easy to tell apart. The file's own
                status decides how it lands: "finished" arrives as a read-only archive,
                "upcoming" arrives ready to prepare, "active" becomes the tournament
                visitors land on by default. A malformed or invalid file is rejected
                before anything is created.
              </li>
              <li>
                The tournament selector above the admin pages picks which tournament
                Games and Squads edit - so an upcoming tournament can be fully prepared
                before it starts.
              </li>
              <li>
                <strong>Admin - Games</strong>: create groups and teams; a team can be
                placed into a group at creation or later, but only while it has no
                fixtures. A group holds at most five teams (and at least two to be
                played); once it is full it drops out of the group picker when you
                add or move a team. The "Games (n)" button generates the missing round-robin
                fixtures with placeholder kick-off times - edit times and courts inline
                in the games table.
              </li>
              <li>
                Once any knockout result or manual pin exists, groups, teams and group
                games are locked against changes; use "Reset knockout" to unlock them.
              </li>
              <li>
                <strong>Admin - Squads</strong>: per-team player lists (name, optional
                jersey number - unique within a team - and position).
              </li>
              <li>
                <strong>Admin - Users</strong>: promote/demote, disable or delete
                accounts. Disabling cuts the user's live connection immediately.
              </li>
              <li>Error messages always appear inside the section they belong to.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
