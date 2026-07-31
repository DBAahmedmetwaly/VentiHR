
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format, subMonths } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Filter, Users, Calendar, TrendingUp } from 'lucide-react';

interface Employee {
  id: string;
  employeeName: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  officialCheckOutTime?: string;
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
}

export default function OvertimeReportPage() {
  const [isMounted, setIsMounted] = useState(false);
  const db = useDb();
  const [reportMonth, setReportMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsMounted(true);
    setReportMonth(format(new Date(), 'yyyy-MM'));
  }, []);

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => (db && reportMonth) ? ref(db, `attendance/${reportMonth}`) : null, [db, reportMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);

  const overtimeRecords = useMemo(() => {
    if (!attendanceData || !isMounted) return [];

    return Object.entries(attendanceData)
      .filter(([, rec]) => rec.overtimeStatus === 'approved' && (rec.overtimeMinutes || 0) > 0)
      .map(([id, rec]) => ({
        ...rec,
        id,
        employeeName: employeesMap.get(rec.employeeId) || 'غير معروف'
      }))
      .filter(rec => 
        rec.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceData, employeesMap, searchTerm, isMounted]);

  const stats = useMemo(() => {
    const totalMinutes = overtimeRecords.reduce((acc, curr) => acc + (curr.overtimeMinutes || 0), 0);
    const uniqueEmployees = new Set(overtimeRecords.map(r => r.employeeId)).size;
    return {
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(2),
      employeeCount: uniqueEmployees,
      recordsCount: overtimeRecords.length
    };
  }, [overtimeRecords]);

  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'));
  const isLoading = isEmployeesLoading || isAttendanceLoading || !isMounted;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-headline font-bold tracking-tight flex items-center gap-2 text-primary">
          <Clock className="h-8 w-8" />
          تقرير الوقت الإضافي المعتمد
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> فلترة التقرير</CardTitle>
          <CardDescription>عرض سجلات الإضافي التي تم اعتمادها من قِبَل الإدارة.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>اختر الشهر</Label>
              <Select dir="rtl" value={reportMonth} onValueChange={setReportMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>
                      {new Date(m + "-02").toLocaleString("ar", { month: "long", year: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>بحث عن موظف</Label>
              <Input 
                placeholder="اسم الموظف..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> إجمالي الدقائق
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-2xl font-bold text-primary font-mono">{stats.totalMinutes} دقيقة</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-100">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" /> إجمالي الساعات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-2xl font-bold text-blue-700 font-mono">{stats.totalHours} ساعة</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> الموظفون
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-2xl font-bold">{stats.employeeCount} موظف</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" /> عدد السجلات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-2xl font-bold">{stats.recordsCount} سجل</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>كشف السجلات المعتمدة</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">موعد الانصراف الرسمي</TableHead>
                  <TableHead className="text-right">الانصراف الفعلي</TableHead>
                  <TableHead className="text-left font-bold text-primary">الإضافي المعتمد</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : overtimeRecords.length > 0 ? (
                  overtimeRecords.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="text-right font-mono">{rec.date}</TableCell>
                      <TableCell className="text-right font-bold">{rec.employeeName}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{rec.officialCheckOutTime || '--:--'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-primary">
                        +{rec.overtimeMinutes} دقيقة
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-green-100 text-green-800">معتمد</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      لا توجد سجلات وقت إضافي معتمدة لهذا الشهر.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
