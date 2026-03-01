import './globals.css';

export const metadata = {
  title: 'Attack Panel',
  description: 'Server Control Dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
