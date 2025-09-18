import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Meeting Secretary",
  description: "Оркестратор процесса транскрибирования и извлечения задач из встреч",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
          <header className="mb-10 text-center">
            <h1 className="text-3xl font-semibold text-slate-900">AI Meeting Secretary</h1>
            <p className="mt-2 text-base text-slate-600">
              Интеллектуальный помощник для обработки медиаконтента встреч и интеграции с Jira
            </p>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-12 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} AI Meeting Secretary. Все права защищены.
          </footer>
        </div>
      </body>
    </html>
  );
}
