import { disconnectNayax } from "@/app/dashboard/actions";

export default function DashError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="empty-state">
          <div className="seal">!</div>
          <h2>{title}</h2>
          <p>{message}</p>
          <form action={disconnectNayax} style={{ marginTop: 18 }}>
            <button type="submit" className="btn btn-gold">
              Re-enter credentials
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
