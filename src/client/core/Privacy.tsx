/** Plain-language privacy notice. Keep it in step with what server/player.ts and the client store. */
export function Privacy() {
  return (
    <div class="rules privacy">
      <p>In Between works without an account. Here is everything it keeps.</p>
      <ul class="rule-list">
        <li>
          <strong>A random player ID in a cookie.</strong> The server creates it on your first visit so your rounds
          are kept. It is not tied to your name, email or device.
        </li>
        <li>
          <strong>Your answers and scores</strong> for each puzzle, stored on the server under that ID.
        </li>
        <li>
          <strong>Your settings and streak history</strong> (theme, past scores) stay in your browser’s
          storage and are not sent to the server.
        </li>
        <li>
          <strong>Server logs</strong> record requests, including IP addresses, to keep the game running.
        </li>
      </ul>
      <p>No ads, no analytics, no third-party trackers. Fonts are served from this site.</p>
      <p>
        Clearing your browser data removes the cookie and your local history; rounds already on the server can no
        longer be linked to you.
      </p>
      <p class="hint">
        Questions: open an issue at <a href="https://github.com/kidev27/inbetween/issues">github.com/kidev27/inbetween</a>.
      </p>
    </div>
  )
}
