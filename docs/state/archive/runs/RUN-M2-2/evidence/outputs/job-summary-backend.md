### Backend coverage

```text
covered 782
total 797
percent 98.11
```

Gate: statement coverage of the unique blocks must reach 90 %.

### Backend benchmarks

```text
BenchmarkCalculate/add-4        	 1000000	      1055 ns/op	     184 B/op	      11 allocs/op
BenchmarkCalculate/add-4        	 1247503	       963.2 ns/op	     184 B/op	      11 allocs/op
BenchmarkCalculate/add-4        	 1234953	       982.6 ns/op	     184 B/op	      11 allocs/op
BenchmarkCalculate/divide_repeating-4         	  870268	      1341 ns/op	     440 B/op	      12 allocs/op
BenchmarkCalculate/divide_repeating-4         	  880964	      1206 ns/op	     440 B/op	      12 allocs/op
BenchmarkCalculate/divide_repeating-4         	 1000000	      1126 ns/op	     440 B/op	      12 allocs/op
BenchmarkCalculate/sqrt_irrational-4          	  289326	      4261 ns/op	    1640 B/op	      37 allocs/op
BenchmarkCalculate/sqrt_irrational-4          	  264224	      4557 ns/op	    1640 B/op	      37 allocs/op
BenchmarkCalculate/sqrt_irrational-4          	  259782	      4795 ns/op	    1640 B/op	      37 allocs/op
BenchmarkCalculate/power_large_integer-4      	   29974	     39259 ns/op	   20115 B/op	     418 allocs/op
BenchmarkCalculate/power_large_integer-4      	   35928	     33090 ns/op	   20115 B/op	     418 allocs/op
BenchmarkCalculate/power_large_integer-4      	   37022	     32268 ns/op	   20115 B/op	     418 allocs/op
BenchmarkCalculate/power_fractional-4         	    6669	    190516 ns/op	  108306 B/op	    2205 allocs/op
BenchmarkCalculate/power_fractional-4         	    6040	    188131 ns/op	  108307 B/op	    2205 allocs/op
BenchmarkCalculate/power_fractional-4         	    5540	    205776 ns/op	  108307 B/op	    2205 allocs/op
BenchmarkCalculate/power_overflow-4           	   95907	     12688 ns/op	    6609 B/op	     139 allocs/op
BenchmarkCalculate/power_overflow-4           	  104884	     11765 ns/op	    6609 B/op	     139 allocs/op
BenchmarkCalculate/power_overflow-4           	  111895	     11451 ns/op	    6609 B/op	     139 allocs/op
BenchmarkCalculateWorstCase/max^0.5-4         	     502	   2373476 ns/op	 2186322 B/op	   18967 allocs/op
BenchmarkCalculateWorstCase/max^0.5-4         	     482	   2483576 ns/op	 2187590 B/op	   18968 allocs/op
BenchmarkCalculateWorstCase/max^0.5-4         	     444	   2756197 ns/op	 2187416 B/op	   18968 allocs/op
BenchmarkCalculateWorstCase/min^0.5-4         	     403	   2636690 ns/op	 2295055 B/op	   20590 allocs/op
BenchmarkCalculateWorstCase/min^0.5-4         	     466	   2602986 ns/op	 2295966 B/op	   20590 allocs/op
BenchmarkCalculateWorstCase/min^0.5-4         	     454	   2530881 ns/op	 2295526 B/op	   20590 allocs/op
BenchmarkCalculateWorstCase/max^0.99…9-4      	     196	   6075549 ns/op	 5373571 B/op	   32386 allocs/op
BenchmarkCalculateWorstCase/max^0.99…9-4      	     178	   6675157 ns/op	 5374398 B/op	   32386 allocs/op
BenchmarkCalculateWorstCase/max^0.99…9-4      	     164	   7259549 ns/op	 5374167 B/op	   32386 allocs/op
BenchmarkCalculateWorstCase/min^0.99…9-4      	     186	   6317318 ns/op	 5450694 B/op	   32917 allocs/op
BenchmarkCalculateWorstCase/min^0.99…9-4      	     186	   6267979 ns/op	 5450758 B/op	   32918 allocs/op
BenchmarkCalculateWorstCase/min^0.99…9-4      	     193	   6544052 ns/op	 5453388 B/op	   32918 allocs/op
BenchmarkCalculateWorstCase/max^-0.99…9-4     	     183	   6315833 ns/op	 5698223 B/op	   33386 allocs/op
BenchmarkCalculateWorstCase/max^-0.99…9-4     	     164	   7156114 ns/op	 5704685 B/op	   33388 allocs/op
BenchmarkCalculateWorstCase/max^-0.99…9-4     	     165	   6806452 ns/op	 5701506 B/op	   33387 allocs/op
BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9-4           	     194	   6159700 ns/op	 5332975 B/op	   32621 allocs/op
BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9-4           	     198	   6535936 ns/op	 5333263 B/op	   32621 allocs/op
BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9-4           	     186	   6260400 ns/op	 5333494 B/op	   32621 allocs/op
BenchmarkCalculateWorstCase/(-1)^1e6144-4                 	     459	   2772690 ns/op	   11267 B/op	      21 allocs/op
BenchmarkCalculateWorstCase/(-1)^1e6144-4                 	     410	   2847318 ns/op	   11259 B/op	      21 allocs/op
BenchmarkCalculateWorstCase/(-1)^1e6144-4                 	     436	   2617862 ns/op	   11257 B/op	      21 allocs/op
```
