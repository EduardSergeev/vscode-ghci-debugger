fib :: Int -> Integer
fib 1 = 1
fib 2 = 1
fib n = fib (n-1) + fib (n-2)

main :: IO ()
main = do
  print $ fib 10
  putStr "Hello"
  putStr ", "
  putStrLn "tester!"
