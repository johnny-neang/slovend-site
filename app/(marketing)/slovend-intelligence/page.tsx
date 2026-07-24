import type { Metadata } from "next";
import InterestForm from "@/components/InterestForm";

export const metadata: Metadata = {
  title: "Slovend Intelligence — Talk to your fleet",
  description:
    "Slovend Intelligence is an AI layer for the vending machines you already own. Ask questions, make changes, and build your own dashboards — powered by frontier LLMs, with no rip-and-replace.",
};

const mcpCode = `<span class="c"># Slovend Intelligence wraps the Nayax Lynx API as MCP tools</span>
<span class="k">GET</span>  /operational/api/v1/machines
<span class="k">GET</span>  /operational/api/v1/machines/{id}/lastSales
<span class="k">GET</span>  /operational/api/v1/machines/{id}/lastAlerts
<span class="k">GET</span>  /operational/api/v1/machines/{id}/machineProducts
<span class="k">PUT</span>  /operational/api/v1/machines/{id}/machineProducts/{pid}
<span class="k">POST</span> /operational/api/v1/report/widgetData

<span class="c"># host lynx.nayax.com · auth Bearer &lt;token&gt;</span>
<span class="s">→ "How much did machine 5001 make last week?"</span>`;

export default function SlovendIntelligence() {
  return (
    <>
      {/* HERO */}
      <section className="v-hero">
        <div className="v-hero-glow" />
        <div className="wrap v-hero-in">
          <div>
            <span className="badge">
              <span className="pulse" />
              Preview · Now in private testing
            </span>
            <div className="wordmark">
              Slovend
              <br />
              <span className="ai">Intelligence</span>
            </div>
            <h1 className="sub">
              Talk to your whole fleet
              <br />
              in plain language.
            </h1>
            <p className="lead">
              Slovend Intelligence is an AI layer for the vending machines you
              already own. Ask questions, make changes, and build your own
              dashboards — powered by frontier LLMs, with no rip-and-replace.
            </p>
            <div className="v-cta">
              <a href="#interest" className="btn btn-gold">
                Request early access
              </a>
              <a href="#how" className="btn btn-ghost">
                See how it works
              </a>
            </div>
            <div className="v-note" style={{ marginTop: 22 }}>
              By Slovend · Building on Nayax first
            </div>
          </div>

          {/* chat mockup */}
          <div className="chat" aria-hidden="true">
            <div className="chat-head">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span className="name">Slovend Intelligence</span>
              <span className="on">online</span>
            </div>
            <div className="chat-body">
              <div className="msg user">
                How did the Greenpoint machine do last week?
              </div>
              <div className="tool">
                <span className="verb">GET</span>{" "}
                /operational/api/v1/machines/5001/lastSales
              </div>
              <div className="msg bot">
                Greenpoint brought in <b>$1,284</b> across 412 vends. Cold brew
                was your top seller — it sold out Thursday at 4pm.
              </div>
              <div className="msg user">Raise the cold brew restock alert to 8.</div>
              <div className="tool">
                <span className="verb">PUT</span>{" "}
                /machines/5001/machineProducts/101 · {`{ "VendOutAlertThreshold": 8 }`}
              </div>
              <div className="msg bot">
                Done. You&apos;ll get an alert whenever Greenpoint drops below 8
                cold brews.
              </div>
            </div>
            <div className="chat-input">
              <div className="box">
                Ask anything about your fleet
                <span className="cursor" />
              </div>
              <button className="send" tabIndex={-1}>
                ↑
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <div className="kicker">What Slovend Intelligence does</div>
            <h2>An interface, not a replacement.</h2>
          </div>
          <div className="vals" style={{ marginTop: 48 }}>
            <div className="val">
              <div className="ic">❝</div>
              <h3>Natural language</h3>
              <p>
                Ask about sales, stock, faults or routes the way you&apos;d ask a
                colleague. Slovend Intelligence reads your fleet and answers — and
                can make the change for you.
              </p>
            </div>
            <div className="val">
              <div className="ic">▦</div>
              <h3>Build your own dashboard</h3>
              <p>
                Describe the view you want and Slovend Intelligence assembles it:
                the tiles, charts and alerts that matter to your operation, no
                spreadsheets required.
              </p>
            </div>
            <div className="val">
              <div className="ic">⟲</div>
              <h3>Works with what you have</h3>
              <p>
                Slovend Intelligence sits on top of your existing machines and
                telemetry. We don&apos;t replace your hardware or your provider —
                we make them speak plainly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap dash">
          <div className="dash-mock" aria-hidden="true">
            <div className="tiles">
              <div className="tile">
                <div className="l">Revenue · 7d</div>
                <div className="n">$1,284</div>
                <div className="d">▲ 12.4%</div>
              </div>
              <div className="tile">
                <div className="l">Vends · 7d</div>
                <div className="n">412</div>
                <div className="d">▲ 6.1%</div>
              </div>
              <div className="tile chart">
                <div className="l">Daily vends</div>
                <div className="bars">
                  <i style={{ height: "40%" }} />
                  <i style={{ height: "62%" }} />
                  <i style={{ height: "48%" }} />
                  <i style={{ height: "78%" }} />
                  <i className="hi" style={{ height: "95%" }} />
                  <i style={{ height: "70%" }} />
                  <i style={{ height: "55%" }} />
                </div>
              </div>
              <div className="tile">
                <div className="l">Top SKU</div>
                <div className="n" style={{ fontSize: 22 }}>
                  Cold Brew
                </div>
                <div className="d">sold out Thu</div>
              </div>
              <div className="tile">
                <div className="l">Needs restock</div>
                <div className="n" style={{ fontSize: 22 }}>
                  3 bays
                </div>
                <div className="d" style={{ color: "var(--cherry-hi)" }}>
                  A2 · B4 · C1
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="kicker">Your data, your way</div>
            <h2
              className="serif-display"
              style={{ fontSize: "clamp(30px,4.2vw,46px)", marginTop: 18 }}
            >
              A dashboard that
              <br />
              <span className="ital">builds itself.</span>
            </h2>
            <p className="lead" style={{ marginTop: 20 }}>
              Tell Slovend Intelligence what you want to keep an eye on — revenue
              by site, low-stock bays, top sellers, faults — and it lays out a
              live dashboard for you. Change your mind? Just ask again.
            </p>
            <p
              className="mono"
              style={{
                fontSize: 13,
                color: "var(--cherry)",
                marginTop: 22,
                letterSpacing: ".02em",
              }}
            >
              &quot;show me revenue and low-stock bays for Greenpoint&quot;
            </p>
          </div>
        </div>
      </section>

      {/* MCP / NAYAX */}
      <section className="section mcp">
        <div className="wrap mcp-in">
          <div className="mcp-code" aria-hidden="true">
            <div className="bar">
              <i />
              <i />
              <i />
            </div>
            <pre dangerouslySetInnerHTML={{ __html: mcpCode }} />
          </div>
          <div className="mcp-copy">
            <div className="kicker">Under the hood</div>
            <h2
              className="serif-display"
              style={{ fontSize: "clamp(28px,4vw,42px)", marginTop: 18 }}
            >
              Built on the
              <br />
              Model Context Protocol.
            </h2>
            <p className="lead" style={{ marginTop: 18 }}>
              Slovend Intelligence wraps the{" "}
              <b className="gold">Nayax Lynx API</b> in a standard set of MCP
              tools, so frontier LLMs can read live machine, sales and inventory
              data — and take safe, scoped actions like adjusting a
              product&apos;s restock threshold. We&apos;re starting with Nayax,
              with more providers to follow.
            </p>
            <div className="v-note" style={{ marginTop: 20 }}>
              Private beta · rolling out shortly
            </div>
          </div>
        </div>
      </section>

      {/* INTEREST FORM */}
      <section className="section form-sec" id="interest">
        <div className="sunburst" />
        <div className="wrap">
          <div className="form-card">
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
            <InterestForm />
          </div>
        </div>
      </section>
    </>
  );
}
