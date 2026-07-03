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
          creates a viewer. The EN / UA / PT buttons in the header switch the interface
          language at any time.
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
        <p>Pick a team to see its squad: player names, jersey numbers and positions.</p>
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
                <strong>Admin - Games</strong>: create groups and teams; a team can be
                placed into a group at creation or later, but only while it has no
                fixtures. The "Games (n)" button generates the missing round-robin
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
