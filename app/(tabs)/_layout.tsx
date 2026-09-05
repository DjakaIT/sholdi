/**
 * Bottom tab shell. DESIGN.md §5.2 — Home · Stats · Add · Ask · Index.
 *
 * Uses Expo Router's headless tabs so the bar can be entirely custom: `TabList`
 * renders as our `TabBar`, each `TabTrigger` as a `TabBarItem`.
 *
 * Add is deliberately NOT a tab route. Per ARCHITECTURE.md §2 it lives at `app/add/`
 * and is presented as a bottom sheet over Home, so it sits in the bar as a plain
 * item. Expo Router ignores non-trigger children when collecting routes.
 */
import { ChartNoAxesColumn, House, LayoutGrid, MessageCircle, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { TabBar, TabBarItem } from '@/components/TabBar';

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabBarItem icon={House} label="Home" />
          </TabTrigger>
          <TabTrigger name="stats" href="/stats" asChild>
            <TabBarItem icon={ChartNoAxesColumn} label="Stats" />
          </TabTrigger>
          <TabBarItem
            icon={Plus}
            label="Add spending"
            onPress={() => router.push('/add')}
          />
          <TabTrigger name="ask" href="/ask" asChild>
            <TabBarItem icon={MessageCircle} label="Ask" />
          </TabTrigger>
          <TabTrigger name="categories" href="/categories" asChild>
            <TabBarItem icon={LayoutGrid} label="Index" />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}
