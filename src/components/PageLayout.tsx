import MobileBottomNav from './MobileBottomNav';
import Navbar from './Navbar';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideNav?: boolean;
}

const PageLayout = ({ children, activePath = '/', hideNav }: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      {!hideNav && <Navbar />}

      {/* 主内容 */}
      <main
        className='flex-1'
        style={{
          paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>

      {/* 移动端底部导航 */}
      <MobileBottomNav activePath={activePath} />
    </div>
  );
};

export default PageLayout;
