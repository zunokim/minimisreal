'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // 본인의 Supabase 클라이언트 경로에 맞게 수정
import { INDICATOR_META } from '@/lib/indicatorMeta';
import { Info, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

export default function DashboardClient() {
  const [baseDate, setBaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [currentData, setCurrentData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // DB에서 데이터 조회 (선택한 날짜 데이터 + 차트용 과거 데이터)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. 선택한 날짜의 타겟 데이터 및 AI 코멘트 가져오기
      const { data: targetData } = await supabase
        .from('macro_indicators')
        .select('*')
        .eq('base_date', baseDate)
        .single();
      
      setCurrentData(targetData || null);

      // 2. 차트용 과거 데이터 가져오기 (기간에 따라 가져올 갯수를 다르게 설정)
      let limit = 30; // 기본 30일치 표시
      if (period === 'weekly') limit = 30; // 필요시 7주치 등 유동적으로 변경 가능
      if (period === 'monthly') limit = 30; // 필요시 월간 데이터를 묶어서 보여주도록 쿼리 변경 가능
      
      const { data: historyData } = await supabase
        .from('macro_indicators')
        .select('*')
        .lte('base_date', baseDate)
        .order('base_date', { ascending: false })
        .limit(limit);

      if (historyData) {
        // 차트는 과거순(왼쪽->오른쪽)으로 그려져야 하므로 역순 정렬
        setChartData(historyData.reverse());
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 수동 갱신 버튼 클릭
  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      // ✅ period 파라미터를 추가하여 API에 일/주/월간 데이터 수집 범위를 알려줌
      const res = await fetch(`/api/macro/update?date=${baseDate}&period=${period}`, { method: 'POST' });
      const result = await res.json();
      
      if (result.success) {
        alert(result.message || '데이터 및 AI 분석이 갱신되었습니다.');
        fetchData(); // 갱신 후 화면 다시 그리기
      } else {
        alert(`갱신 중 오류가 발생했습니다: ${result.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('갱신 요청 중 통신 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [baseDate, period]);

  // 지표 카드 렌더링 함수 (도움말 툴팁 포함)
  const renderIndicatorCard = (key: keyof typeof INDICATOR_META, value: number | undefined, unit: string) => {
    const meta = INDICATOR_META[key];
    return (
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2">
          <span className="text-gray-500 font-medium text-sm flex items-center gap-1 group relative">
            {meta.title}
            <Info className="w-4 h-4 text-gray-400 cursor-help" />
            {/* 툴팁 */}
            <div className="absolute left-0 bottom-full mb-2 hidden w-64 bg-gray-800 text-white text-xs rounded p-2 group-hover:block z-10 shadow-lg">
              <p className="font-bold mb-1">{meta.title}</p>
              <p className="mb-1 text-gray-300">{meta.meaning}</p>
              <p className="text-blue-300">💡 {meta.whyTrack}</p>
            </div>
          </span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {value !== undefined && value !== null ? `${value.toLocaleString()}${unit}` : '-'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 컨트롤 패널 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={baseDate} 
            onChange={(e) => setBaseDate(e.target.value)}
            className="border-gray-300 rounded-lg p-2 border focus:ring-blue-500"
          />
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {['daily', 'weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as any)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === p ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'daily' ? '일간' : p === 'weekly' ? '주간' : '월간'}
              </button>
            ))}
          </div>
        </div>
        
        <button 
          onClick={handleUpdate}
          disabled={isLoading}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? '수집 및 AI 분석 중...' : '데이터 수동 갱신'}
        </button>
      </div>

      {/* 2. AI 분석 코멘트 (데이터가 있을 때만 표시) */}
      {currentData?.ai_analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100 shadow-sm">
          <h2 className="text-lg font-bold text-blue-900 mb-2 flex items-center gap-2">
            ✨ AI 기획팀 시황 분석 ({period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 추세)
          </h2>
          <div className="text-blue-800 text-sm whitespace-pre-wrap leading-relaxed">
            {currentData.ai_analysis}
          </div>
        </div>
      )}

      {/* 3. 핵심 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {renderIndicatorCard('kr_bond_3y', currentData?.kr_bond_3y, '%')}
        {renderIndicatorCard('us_bond_10y', currentData?.us_bond_10y, '%')}
        {renderIndicatorCard('kospi_index', currentData?.kospi_index, ' pt')}
        {renderIndicatorCard('kospi_volume', currentData?.kospi_volume, '조')}
        {renderIndicatorCard('usd_krw', currentData?.usd_krw, ' 원')}
      </div>

      {/* 4. 시계열 추세 차트 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border h-[400px]">
        <h3 className="font-bold text-gray-800 mb-4">최근 30일 KOSPI & 환율 추세</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="base_date" tick={{fontSize: 12}} tickMargin={10} />
              <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="#3b82f6" tick={{fontSize: 12}} />
              <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} stroke="#10b981" tick={{fontSize: 12}} />
              <RechartsTooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="kospi_index" name="KOSPI 지수" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="usd_krw" name="원/달러 환율" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            데이터가 없습니다. 우측 상단의 갱신 버튼을 눌러 데이터를 수집해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}